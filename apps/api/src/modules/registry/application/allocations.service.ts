import { Inject, Injectable } from '@nestjs/common';
import { parseDecimal } from '@virtus/shared';
import { and, asc, desc, eq } from 'drizzle-orm';
import { AuditWriter } from '../../../core/audit/audit-writer.js';
import { currentUser } from '../../../core/context/request-context.js';
import {
  DATABASE,
  type Database,
  type Transaction,
  withCurrentTenant,
} from '../../../core/database/database.js';
import { workflowTransition } from '../../../core/database/schema.js';
import { AppError } from '../../../core/errors/app-error.js';
import { Outbox } from '../../../core/outbox/outbox.js';
import { Workflow } from '../../../core/workflow/workflow.js';
import { UserDirectory } from '../../iam/index.js';
import { IssuancesService, type IssuanceDetail } from '../../issuance/index.js';
import {
  allocationAmount,
  allocationRoundMachine,
  checkAllocation,
  type AllocationFailure,
  type AllocationRoundStatus,
} from '../domain/allocation.js';
import { allocation, allocationRound } from '../infrastructure/schema.js';
import { LedgerWriter } from './ledger-writer.js';
import { ALLOCATION_EVENTS } from './subscription-event-types.js';
import { SubscriptionsService } from './subscriptions.service.js';

type RoundRow = typeof allocationRound.$inferSelect;

export interface AllocationLine {
  id: string;
  subscriptionId: string;
  investorId: string;
  investorName: string;
  requestedUnits: string;
  allocatedUnits: string;
  amount: string;
  subscriptionStatus: string;
}

export interface AllocationRoundDetail {
  round: RoundRow;
  issuance: {
    id: string;
    name: string;
    code: string;
    status: string;
    currency: string;
    nominalValue: string;
    totalUnits: string;
    minimumAmount: string | null;
  };
  lines: AllocationLine[];
  totals: { requestedUnits: string; allocatedUnits: string; allocatedAmount: string };
  /** Checks of the round as it stands (SPEC §10.1, D-013), shown while it is prepared. */
  failures: AllocationFailure[];
  proposedByName: string | null;
  validatedByName: string | null;
}

/**
 * Manual allocation (SPEC §10.1, §9.4 "priorité MVP : allocation manuelle"). After subscriptions
 * close and every subscription is decided, the issuer prepares a round (one line per approved
 * subscription, prefilled with the requested units), proposes it, and another Issuer
 * Administrator validates it: the units are created, allocated and blocked until payment in the
 * registry, the subscriptions move on and the issuance becomes ALLOCATED — all in one transaction.
 */
@Injectable()
export class AllocationsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly issuances: IssuancesService,
    private readonly subscriptions: SubscriptionsService,
    private readonly ledger: LedgerWriter,
    private readonly workflow: Workflow,
    private readonly audit: AuditWriter,
    private readonly outbox: Outbox,
    private readonly users: UserDirectory,
  ) {}

  /** Rounds of an issuance, newest first. Investors never see them. */
  list(issuanceId: string): Promise<AllocationRoundDetail[]> {
    return withCurrentTenant(this.db, async (tx) => {
      if (this.ownScope()) return [];
      const detail = await this.issuances.find(tx, issuanceId);
      const rounds = await tx
        .select()
        .from(allocationRound)
        .where(eq(allocationRound.issuanceId, issuanceId))
        .orderBy(desc(allocationRound.createdAt), desc(allocationRound.id));
      return Promise.all(rounds.map((round) => this.describe(tx, round, detail)));
    });
  }

  get(id: string): Promise<AllocationRoundDetail> {
    return withCurrentTenant(this.db, async (tx) => {
      const round = await this.find(tx, id);
      return this.describe(tx, round, await this.issuances.find(tx, round.issuanceId));
    });
  }

  /** A new round, once subscriptions are closed and every subscription is decided. */
  create(issuanceId: string): Promise<AllocationRoundDetail> {
    return withCurrentTenant(this.db, async (tx, tenantId) => {
      const detail = await this.issuances.find(tx, issuanceId, true);
      if (detail.issuance.status !== 'SUBSCRIPTION_CLOSED')
        throw new AppError('INVALID_STATE_TRANSITION');
      const undecided = await this.subscriptions.undecidedCount(tx, issuanceId);
      if (undecided > 0) {
        throw new AppError('SUBSCRIPTIONS_TO_DECIDE', [
          { code: 'SUBSCRIPTIONS_TO_DECIDE', field: null, meta: { count: undecided } },
        ]);
      }
      const [inProgress] = await tx
        .select({ id: allocationRound.id, status: allocationRound.status })
        .from(allocationRound)
        .where(eq(allocationRound.issuanceId, issuanceId))
        .orderBy(desc(allocationRound.createdAt));
      if (inProgress && inProgress.status !== 'REJECTED') {
        throw new AppError('INVALID_STATE_TRANSITION', [
          { code: 'ALLOCATION_ROUND_IN_PROGRESS', field: null },
        ]);
      }
      const approved = await this.subscriptions.approvedFor(tx, issuanceId);
      const nominal = detail.terms.nominalValue!;
      const total = approved.reduce(
        (sum, row) => sum.plus(parseDecimal(row.requestedUnits)),
        parseDecimal('0'),
      );
      const userId = currentUser().userId;
      const [round] = await tx
        .insert(allocationRound)
        .values({
          tenantId,
          issuanceId,
          totalAllocatedUnits: total.toString(),
          createdBy: userId,
        })
        .returning();
      if (approved.length > 0) {
        await tx.insert(allocation).values(
          approved.map((row) => ({
            tenantId,
            allocationRoundId: round!.id,
            subscriptionId: row.id,
            investorId: row.investorId,
            allocatedUnits: row.requestedUnits,
            amount: allocationAmount(row.requestedUnits, nominal),
            currency: row.currency,
            createdBy: userId,
          })),
        );
      }
      await this.workflow.start(tx, allocationRoundMachine, {
        tenantId,
        resourceId: round!.id,
        to: 'DRAFT',
      });
      await this.audit.recordIn(tx, {
        tenantId,
        action: 'ALLOCATION_ROUND_CREATED',
        resourceType: 'allocation_round',
        resourceId: round!.id,
        newValue: { issuanceId, lines: approved.length, totalAllocatedUnits: total.toString() },
        result: 'SUCCESS',
      });
      return this.describe(tx, round!, detail);
    });
  }

  /** Units of the lines and the D-013 justification, while the round is a draft. */
  update(
    id: string,
    version: number,
    changes: {
      lines?: readonly { subscriptionId: string; allocatedUnits: string }[];
      minimumWaiverJustification?: string | null;
    },
  ): Promise<AllocationRoundDetail> {
    return withCurrentTenant(this.db, async (tx, tenantId) => {
      const peek = await this.find(tx, id);
      const detail = await this.issuances.find(tx, peek.issuanceId, true);
      const round = await this.find(tx, id, true);
      if (round.status !== 'DRAFT') throw new AppError('INVALID_STATE_TRANSITION');
      if (round.version !== version) throw new AppError('VERSION_CONFLICT');
      const lines = await this.linesOf(tx, id);
      const bySubscription = new Map(lines.map((line) => [line.subscriptionId, line]));
      const unknown = (changes.lines ?? []).filter(
        (line) => !bySubscription.has(line.subscriptionId),
      );
      if (unknown.length > 0) {
        throw new AppError(
          'VALIDATION_FAILED',
          unknown.map((line) => ({
            code: 'NOT_A_LINE_OF_ROUND',
            field: 'lines',
            meta: { subscriptionId: line.subscriptionId },
          })),
        );
      }
      for (const change of changes.lines ?? []) {
        const line = bySubscription.get(change.subscriptionId)!;
        const units = parseDecimal(change.allocatedUnits).toString();
        await tx
          .update(allocation)
          .set({
            allocatedUnits: units,
            amount: allocationAmount(units, detail.terms.nominalValue!),
            updatedAt: new Date(),
          })
          .where(eq(allocation.id, line.id));
        bySubscription.set(change.subscriptionId, { ...line, allocatedUnits: units });
      }
      const total = [...bySubscription.values()].reduce(
        (sum, line) => sum.plus(parseDecimal(line.allocatedUnits)),
        parseDecimal('0'),
      );
      await tx
        .update(allocationRound)
        .set({
          totalAllocatedUnits: total.toString(),
          ...(changes.minimumWaiverJustification !== undefined
            ? { minimumWaiverJustification: changes.minimumWaiverJustification?.trim() || null }
            : {}),
          version: round.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(allocationRound.id, id));
      await this.audit.recordIn(tx, {
        tenantId,
        action: 'ALLOCATION_ROUND_UPDATED',
        resourceType: 'allocation_round',
        resourceId: id,
        oldValue: { totalAllocatedUnits: round.totalAllocatedUnits },
        newValue: {
          totalAllocatedUnits: total.toString(),
          lines: (changes.lines ?? []).length,
          ...(changes.minimumWaiverJustification !== undefined
            ? { minimumWaiverJustification: changes.minimumWaiverJustification }
            : {}),
        },
        result: 'SUCCESS',
      });
      return this.describe(tx, await this.find(tx, id), detail);
    });
  }

  /** The preparer proposes the round: its checks must pass. */
  propose(id: string): Promise<AllocationRoundDetail> {
    return this.transition(id, 'PROPOSED', null, async (tx, round, detail) => {
      this.assertChecks(await this.failuresOf(tx, round, detail));
      await tx
        .update(allocationRound)
        .set({ proposedBy: currentUser().userId, proposedAt: new Date() })
        .where(eq(allocationRound.id, id));
      return ALLOCATION_EVENTS.proposed;
    });
  }

  /**
   * Validation by another Issuer Administrator (four eyes): ISSUANCE (at the first allocation),
   * then for each line ALLOCATION and BLOCK, in one transaction with the subscriptions' and the
   * issuance's new statuses (D-009). The invariants are checked before the commit.
   */
  validate(id: string): Promise<AllocationRoundDetail> {
    return this.transition(id, 'VALIDATED', null, async (tx, round, detail, tenantId) => {
      if (detail.issuance.status !== 'SUBSCRIPTION_CLOSED')
        throw new AppError('INVALID_STATE_TRANSITION');
      this.assertChecks(await this.failuresOf(tx, round, detail));
      const lines = await this.linesOf(tx, id);
      const subscriptions = await this.subscriptions.byIds(
        tx,
        lines.map((line) => line.subscriptionId),
        true,
      );
      const outdated = lines.filter(
        (line) => subscriptions.get(line.subscriptionId)?.status !== 'APPROVED',
      );
      if (outdated.length > 0) {
        throw new AppError(
          'INVALID_STATE_TRANSITION',
          outdated.map((line) => ({
            code: 'SUBSCRIPTION_NOT_APPROVED',
            field: null,
            meta: { subscriptionId: line.subscriptionId },
          })),
        );
      }
      await this.writeRegistry(tx, tenantId, round, detail, lines);
      for (const line of lines) {
        await this.subscriptions.applyAllocation(
          tx,
          tenantId,
          subscriptions.get(line.subscriptionId)!,
          line.allocatedUnits,
          line.amount,
        );
      }
      await this.issuances.markAllocated(tx, tenantId, detail.issuance.id);
      await tx
        .update(allocationRound)
        .set({ validatedBy: currentUser().userId, validatedAt: new Date() })
        .where(eq(allocationRound.id, id));
      return null;
    });
  }

  /** Rejected by the validator, or abandoned by the preparer while a draft; a comment is required. */
  reject(id: string, comment: string): Promise<AllocationRoundDetail> {
    return this.transition(id, 'REJECTED', comment, async (tx, round) => {
      await tx
        .update(allocationRound)
        .set({ rejectionComment: comment.trim() })
        .where(eq(allocationRound.id, id));
      return round.status === 'PROPOSED' ? ALLOCATION_EVENTS.rejected : null;
    });
  }

  /** History of the statuses. */
  transitions(id: string) {
    return withCurrentTenant(this.db, async (tx) => {
      await this.find(tx, id);
      const rows = await tx
        .select()
        .from(workflowTransition)
        .where(
          and(
            eq(workflowTransition.resourceType, 'allocation_round'),
            eq(workflowTransition.resourceId, id),
          ),
        )
        .orderBy(asc(workflowTransition.occurredAt));
      const names = await this.users.namesOf(
        tx,
        rows.flatMap((row) => (row.actorUserId ? [row.actorUserId] : [])),
      );
      return rows.map((row) => ({
        ...row,
        actorName: row.actorUserId ? (names.get(row.actorUserId) ?? null) : null,
      }));
    });
  }

  /** The registry entries of a validated round (docs/ARCHITECTURE.md §4.6). */
  private async writeRegistry(
    tx: Transaction,
    tenantId: string,
    round: RoundRow,
    detail: IssuanceDetail,
    lines: readonly AllocationLine[],
  ): Promise<void> {
    const issuanceId = detail.issuance.id;
    const currency = detail.issuance.currency!;
    const head = await this.ledger.lock(tx, tenantId, issuanceId);
    const treasury = await this.ledger.account(tx, tenantId, issuanceId, null, currency);
    const reference = {
      businessReference: `allocation-round:${round.id}`,
      metadata: { allocationRoundId: round.id },
    };
    const entries: Parameters<LedgerWriter['post']>[3][number][] = [];
    // The units of the issuance are created once, at its first allocation.
    if (head.lastSequence === 0) {
      entries.push({
        type: 'ISSUANCE',
        sourceAccountId: null,
        destinationAccountId: treasury,
        quantity: detail.terms.totalUnits!,
        ...reference,
      });
    }
    for (const line of lines) {
      if (parseDecimal(line.allocatedUnits).isZero()) continue;
      const account = await this.ledger.account(
        tx,
        tenantId,
        issuanceId,
        line.investorId,
        currency,
      );
      const metadata = { ...reference.metadata, subscriptionId: line.subscriptionId };
      entries.push(
        {
          type: 'ALLOCATION',
          sourceAccountId: treasury,
          destinationAccountId: account,
          quantity: line.allocatedUnits,
          amount: line.amount,
          businessReference: reference.businessReference,
          metadata,
        },
        // Blocked until the fictitious payment is confirmed (D-009).
        {
          type: 'BLOCK',
          sourceAccountId: account,
          destinationAccountId: account,
          quantity: line.allocatedUnits,
          businessReference: reference.businessReference,
          metadata,
        },
      );
    }
    await this.ledger.post(tx, tenantId, issuanceId, entries);
    await this.ledger.assertConsistent(tx, issuanceId, detail.terms.totalUnits);
  }

  /**
   * One transition of a round: issuance locked first (same order as subscriptions), machine
   * check (four eyes against the preparer), the use case, the status, audit and event.
   */
  private transition(
    id: string,
    to: AllocationRoundStatus,
    comment: string | null,
    apply: (
      tx: Transaction,
      round: RoundRow,
      detail: IssuanceDetail,
      tenantId: string,
    ) => Promise<string | null>,
  ): Promise<AllocationRoundDetail> {
    return withCurrentTenant(this.db, async (tx, tenantId) => {
      const peek = await this.find(tx, id);
      const detail = await this.issuances.find(tx, peek.issuanceId, true);
      const round = await this.find(tx, id, true);
      const from = round.status as AllocationRoundStatus;
      await this.workflow.transition(tx, allocationRoundMachine, {
        tenantId,
        resourceId: id,
        from,
        to,
        comment,
        initiatorUserId: round.proposedBy,
      });
      const event = await apply(tx, round, detail, tenantId);
      await tx
        .update(allocationRound)
        .set({ status: to, version: round.version + 1, updatedAt: new Date() })
        .where(eq(allocationRound.id, id));
      await this.audit.recordIn(tx, {
        tenantId,
        action: `ALLOCATION_ROUND_${to}`,
        resourceType: 'allocation_round',
        resourceId: id,
        oldValue: { status: from },
        newValue: {
          status: to,
          totalAllocatedUnits: round.totalAllocatedUnits,
          // The D-013 justification is kept with the decision it allowed.
          ...(round.minimumWaiverJustification
            ? { minimumWaiverJustification: round.minimumWaiverJustification }
            : {}),
        },
        result: 'SUCCESS',
        ...(comment ? { reason: 'COMMENTED' } : {}),
      });
      if (event) {
        await this.outbox.publish(tx, {
          tenantId,
          eventType: event,
          aggregateType: 'allocation_round',
          aggregateId: id,
          payload: {
            code: detail.issuance.code,
            issuanceId: detail.issuance.id,
            proposedBy: round.proposedBy ?? currentUser().userId,
          },
        });
      }
      const updated = await this.find(tx, id);
      return this.describe(tx, updated, await this.issuances.find(tx, updated.issuanceId));
    });
  }

  private assertChecks(failures: readonly AllocationFailure[]): void {
    const [first] = failures;
    if (!first) return;
    throw new AppError(
      first.code,
      failures.map((failure) => ({
        code: failure.code,
        field: null,
        meta: 'meta' in failure ? failure.meta : { subscriptionId: failure.subscriptionId },
      })),
    );
  }

  private async failuresOf(
    tx: Transaction,
    round: RoundRow,
    detail: IssuanceDetail,
  ): Promise<AllocationFailure[]> {
    return checkAllocation({
      lines: await this.linesOf(tx, round.id),
      totalUnits: detail.terms.totalUnits!,
      nominalValue: detail.terms.nominalValue!,
      minimumAmount: detail.terms.minimumAmount,
      minimumWaiverJustification: round.minimumWaiverJustification,
    });
  }

  private async describe(
    tx: Transaction,
    round: RoundRow,
    detail: IssuanceDetail,
  ): Promise<AllocationRoundDetail> {
    const lines = await this.linesOf(tx, round.id);
    const zero = parseDecimal('0');
    const requested = lines.reduce((sum, line) => sum.plus(line.requestedUnits), zero);
    const allocated = lines.reduce((sum, line) => sum.plus(line.allocatedUnits), zero);
    const amount = lines.reduce((sum, line) => sum.plus(line.amount), zero);
    const names = await this.users.namesOf(
      tx,
      [round.proposedBy, round.validatedBy].filter((value): value is string => value !== null),
    );
    return {
      round,
      issuance: {
        id: detail.issuance.id,
        name: detail.issuance.name,
        code: detail.issuance.code,
        status: detail.issuance.status,
        currency: detail.issuance.currency!,
        nominalValue: detail.terms.nominalValue!,
        totalUnits: detail.terms.totalUnits!,
        minimumAmount: detail.terms.minimumAmount,
      },
      lines,
      totals: {
        requestedUnits: requested.toString(),
        allocatedUnits: allocated.toString(),
        allocatedAmount: amount.toString(),
      },
      failures: round.status === 'DRAFT' ? await this.failuresOf(tx, round, detail) : [],
      proposedByName: round.proposedBy ? (names.get(round.proposedBy) ?? null) : null,
      validatedByName: round.validatedBy ? (names.get(round.validatedBy) ?? null) : null,
    };
  }

  private async linesOf(tx: Transaction, roundId: string): Promise<AllocationLine[]> {
    const rows = await tx
      .select()
      .from(allocation)
      .where(eq(allocation.allocationRoundId, roundId))
      .orderBy(asc(allocation.createdAt), asc(allocation.id));
    const subscriptions = await this.subscriptions.byIds(
      tx,
      rows.map((row) => row.subscriptionId),
    );
    return rows.map((row) => {
      const subscription = subscriptions.get(row.subscriptionId)!;
      return {
        id: row.id,
        subscriptionId: row.subscriptionId,
        investorId: row.investorId,
        investorName: subscription.investorName,
        requestedUnits: parseDecimal(subscription.requestedUnits).toString(),
        allocatedUnits: parseDecimal(row.allocatedUnits).toString(),
        amount: parseDecimal(row.amount).toString(),
        subscriptionStatus: subscription.status,
      };
    });
  }

  /** Investors never see allocation rounds (their subscription shows what they got). */
  private ownScope(): boolean {
    return currentUser().permissions.get('registry:read') === 'own';
  }

  private async find(tx: Transaction, id: string, lock = false): Promise<RoundRow> {
    if (this.ownScope()) throw new AppError('RESOURCE_NOT_FOUND');
    const query = tx.select().from(allocationRound).where(eq(allocationRound.id, id));
    const [row] = lock ? await query.for('update') : await query;
    if (!row) throw new AppError('RESOURCE_NOT_FOUND');
    return row;
  }
}
