import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, type SQL } from 'drizzle-orm';
import { AuditWriter } from '../../../core/audit/audit-writer.js';
import { currentUser } from '../../../core/context/request-context.js';
import {
  DATABASE,
  type Database,
  type Transaction,
  withCurrentTenant,
} from '../../../core/database/database.js';
import { AppError } from '../../../core/errors/app-error.js';
import { Outbox } from '../../../core/outbox/outbox.js';
import { Workflow } from '../../../core/workflow/workflow.js';
import { UserDirectory } from '../../iam/index.js';
import { IssuancesService } from '../../issuance/index.js';
import {
  correctionMachine,
  correctionRefusal,
  counterEntry,
  type CorrectionStatus,
  type Replacement,
} from '../domain/correction.js';
import type { LedgerEntryType } from '../domain/ledger.js';
import { correctionRequest, ledgerEntry, logicalAccount } from '../infrastructure/schema.js';
import { LedgerWriter } from './ledger-writer.js';
import { REGISTRY_EVENTS } from './subscription-event-types.js';

export type CorrectionRow = typeof correctionRequest.$inferSelect & {
  requestedByName: string | null;
  decidedByName: string | null;
};

/**
 * Corrections of the ledger (SPEC §10.3, §4.8, P12-7): an Issuer Administrator proposes to reverse
 * one entry (and to write replacement movements); a Compliance Officer or another Issuer
 * Administrator approves or rejects. Approval writes CORRECTION entries: the original entry is
 * never touched, and the registry invariants are checked before the commit.
 */
@Injectable()
export class CorrectionsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly issuances: IssuancesService,
    private readonly ledger: LedgerWriter,
    private readonly workflow: Workflow,
    private readonly audit: AuditWriter,
    private readonly outbox: Outbox,
    private readonly users: UserDirectory,
  ) {}

  list(filters: { issuanceId?: string; status?: CorrectionStatus }): Promise<CorrectionRow[]> {
    return withCurrentTenant(this.db, async (tx) => {
      if (currentUser().permissions.get('registry:read') === 'own') return [];
      const conditions = [
        filters.issuanceId ? eq(correctionRequest.issuanceId, filters.issuanceId) : undefined,
        filters.status ? eq(correctionRequest.status, filters.status) : undefined,
      ].filter((condition): condition is SQL => condition !== undefined);
      const rows = await tx
        .select()
        .from(correctionRequest)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(correctionRequest.createdAt))
        .limit(100);
      return this.withNames(tx, rows);
    });
  }

  propose(input: {
    targetEntryId: string;
    reason: string;
    replacements: readonly Replacement[];
  }): Promise<CorrectionRow> {
    return withCurrentTenant(this.db, async (tx, tenantId) => {
      const [target] = await tx
        .select()
        .from(ledgerEntry)
        .where(eq(ledgerEntry.id, input.targetEntryId));
      if (!target) throw new AppError('RESOURCE_NOT_FOUND');
      // The issuance first (same lock order as every registry write).
      const detail = await this.issuances.find(tx, target.issuanceId, true);
      const refusal = correctionRefusal({
        target: { ...target, type: target.type as LedgerEntryType },
        alreadyReversed: await this.isReversed(tx, target.id),
        pendingRequest: await this.hasPendingRequest(tx, target.id),
        replacements: input.replacements,
        accountsOfIssuance: await this.accountsOf(tx, target.issuanceId),
      });
      if (refusal) {
        throw new AppError(
          refusal === 'ALREADY_CORRECTED' || refusal === 'CORRECTION_PENDING'
            ? 'INVALID_STATE_TRANSITION'
            : 'VALIDATION_FAILED',
          [{ code: refusal, field: null }],
        );
      }
      const userId = currentUser().userId;
      const [created] = await tx
        .insert(correctionRequest)
        .values({
          tenantId,
          issuanceId: target.issuanceId,
          targetEntryId: target.id,
          proposedEntries: [...input.replacements],
          reason: input.reason.trim(),
          requestedBy: userId,
          createdBy: userId,
        })
        .returning();
      await this.workflow.start(tx, correctionMachine, {
        tenantId,
        resourceId: created!.id,
        to: 'PROPOSED',
      });
      await this.audit.recordIn(tx, {
        tenantId,
        action: 'REGISTRY_CORRECTION_REQUESTED',
        resourceType: 'correction_request',
        resourceId: created!.id,
        newValue: {
          targetEntryId: target.id,
          sequenceNo: target.sequenceNo,
          replacements: input.replacements.length,
        },
        result: 'SUCCESS',
      });
      await this.publish(
        tx,
        tenantId,
        REGISTRY_EVENTS.correctionProposed,
        created!,
        detail.issuance.code,
      );
      return (await this.withNames(tx, [created!]))[0]!;
    });
  }

  /** Writes the counter-entry and the replacements (CORRECTION), then checks the invariants. */
  approve(id: string, comment: string | null): Promise<CorrectionRow> {
    return this.decide(id, 'APPROVED', comment, async (tx, tenantId, row, totalUnits) => {
      const [target] = await tx
        .select()
        .from(ledgerEntry)
        .where(eq(ledgerEntry.id, row.targetEntryId));
      if (await this.isReversed(tx, target!.id)) {
        throw new AppError('INVALID_STATE_TRANSITION', [
          { code: 'ALREADY_CORRECTED', field: null },
        ]);
      }
      const reference = {
        businessReference: `correction:${row.id}`,
        metadata: { correctionRequestId: row.id },
      };
      await this.ledger.post(tx, tenantId, row.issuanceId, [
        {
          type: 'CORRECTION',
          ...counterEntry({ ...target!, type: target!.type as LedgerEntryType }),
          reversesEntryId: target!.id,
          ...reference,
        },
        ...row.proposedEntries.map((line) => ({
          type: 'CORRECTION' as const,
          ...line,
          ...reference,
        })),
      ]);
      await this.ledger.assertConsistent(tx, row.issuanceId, totalUnits);
    });
  }

  reject(id: string, comment: string): Promise<CorrectionRow> {
    return this.decide(id, 'REJECTED', comment, () => Promise.resolve());
  }

  private decide(
    id: string,
    to: CorrectionStatus,
    comment: string | null,
    apply: (
      tx: Transaction,
      tenantId: string,
      row: typeof correctionRequest.$inferSelect,
      totalUnits: string | null,
    ) => Promise<void>,
  ): Promise<CorrectionRow> {
    return withCurrentTenant(this.db, async (tx, tenantId) => {
      const peek = await this.find(tx, id);
      const detail = await this.issuances.find(tx, peek.issuanceId, true);
      const row = await this.find(tx, id, true);
      await this.workflow.transition(tx, correctionMachine, {
        tenantId,
        resourceId: id,
        from: row.status as CorrectionStatus,
        to,
        comment,
        initiatorUserId: row.requestedBy,
      });
      await apply(tx, tenantId, row, detail.terms.totalUnits);
      const [updated] = await tx
        .update(correctionRequest)
        .set({
          status: to,
          decidedBy: currentUser().userId,
          decidedAt: new Date(),
          decisionComment: comment?.trim() || null,
          version: row.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(correctionRequest.id, id))
        .returning();
      await this.audit.recordIn(tx, {
        tenantId,
        action: `REGISTRY_CORRECTION_${to}`,
        resourceType: 'correction_request',
        resourceId: id,
        oldValue: { status: row.status },
        newValue: { status: to, targetEntryId: row.targetEntryId },
        result: 'SUCCESS',
        ...(comment ? { reason: 'COMMENTED' } : {}),
      });
      await this.publish(
        tx,
        tenantId,
        REGISTRY_EVENTS.correctionDecided,
        updated!,
        detail.issuance.code,
        {
          decision: to,
        },
      );
      return (await this.withNames(tx, [updated!]))[0]!;
    });
  }

  private async publish(
    tx: Transaction,
    tenantId: string,
    eventType: string,
    row: typeof correctionRequest.$inferSelect,
    code: string,
    extra: Record<string, string> = {},
  ): Promise<void> {
    await this.outbox.publish(tx, {
      tenantId,
      eventType,
      aggregateType: 'correction_request',
      aggregateId: row.id,
      payload: { code, issuanceId: row.issuanceId, requestedBy: row.requestedBy, ...extra },
    });
  }

  private async isReversed(tx: Transaction, entryId: string): Promise<boolean> {
    const [row] = await tx
      .select({ id: ledgerEntry.id })
      .from(ledgerEntry)
      .where(eq(ledgerEntry.reversesEntryId, entryId));
    return row !== undefined;
  }

  private async hasPendingRequest(tx: Transaction, entryId: string): Promise<boolean> {
    const [row] = await tx
      .select({ id: correctionRequest.id })
      .from(correctionRequest)
      .where(
        and(
          eq(correctionRequest.targetEntryId, entryId),
          inArray(correctionRequest.status, ['PROPOSED']),
        ),
      );
    return row !== undefined;
  }

  private async accountsOf(tx: Transaction, issuanceId: string): Promise<Set<string>> {
    const rows = await tx
      .select({ id: logicalAccount.id })
      .from(logicalAccount)
      .where(eq(logicalAccount.issuanceId, issuanceId));
    return new Set(rows.map((row) => row.id));
  }

  private async withNames(
    tx: Transaction,
    rows: (typeof correctionRequest.$inferSelect)[],
  ): Promise<CorrectionRow[]> {
    const names = await this.users.namesOf(
      tx,
      rows.flatMap((row) => [row.requestedBy, ...(row.decidedBy ? [row.decidedBy] : [])]),
    );
    return rows.map((row) => ({
      ...row,
      requestedByName: names.get(row.requestedBy) ?? null,
      decidedByName: row.decidedBy ? (names.get(row.decidedBy) ?? null) : null,
    }));
  }

  private async find(
    tx: Transaction,
    id: string,
    lock = false,
  ): Promise<typeof correctionRequest.$inferSelect> {
    if (currentUser().permissions.get('registry:read') === 'own')
      throw new AppError('RESOURCE_NOT_FOUND');
    const query = tx.select().from(correctionRequest).where(eq(correctionRequest.id, id));
    const [row] = lock ? await query.for('update') : await query;
    if (!row) throw new AppError('RESOURCE_NOT_FOUND');
    return row;
  }
}
