import { Inject, Injectable } from '@nestjs/common';
import { CURRENCY_MINOR_UNITS, isCurrencyCode, parseDecimal } from '@virtus/shared';
import { and, asc, count, desc, eq, gt, isNotNull, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { AuditWriter } from '../../../core/audit/audit-writer.js';
import { currentUser, type RequestUser } from '../../../core/context/request-context.js';
import {
  DATABASE,
  type Database,
  type Transaction,
  withCurrentTenant,
} from '../../../core/database/database.js';
import { workflowTransition } from '../../../core/database/schema.js';
import { AppError } from '../../../core/errors/app-error.js';
import { offsetOf, type Page, type Pagination } from '../../../core/http/pagination.js';
import { Outbox } from '../../../core/outbox/outbox.js';
import { Workflow } from '../../../core/workflow/workflow.js';
import { TenantDirectory, UserDirectory } from '../../iam/index.js';
import { EligibilityService, investor, InvestorsService } from '../../investor-compliance/index.js';
import {
  issuance,
  IssuancesService,
  ruleSetOf,
  type IssuanceDetail,
} from '../../issuance/index.js';
import {
  BLOCKED_STATUSES,
  checkTransfer,
  exceedsHoldingLimit,
  transferMachine,
  transferredAcquisition,
  type TransferStatus,
} from '../domain/transfer.js';
import { position, transferRequest } from '../infrastructure/schema.js';
import { LedgerWriter } from './ledger-writer.js';
import { TRANSFER_EVENTS } from './subscription-event-types.js';

export type TransferRow = typeof transferRequest.$inferSelect;
export type TransferWithNames = TransferRow & {
  issuanceName: string;
  issuanceCode: string;
  fromInvestorName: string;
  /** Hidden from the sender (D-010). */
  toInvestorName: string | null;
};

export interface TransferInput {
  recipientCode: string;
  quantity: string;
  indicativePrice?: string | null;
}

const recipient = alias(investor, 'recipient');

/**
 * Transfers between investors (SPEC §11, D-010): the holder asks with the recipient's code; the
 * submission checks §11.3, records the recipient's eligibility and blocks the units; a Compliance
 * Officer or an Issuer Administrator approves (UNBLOCK + TRANSFER, executed at once) or rejects
 * (UNBLOCK). The sender never learns who the recipient is, nor why it is not eligible.
 */
@Injectable()
export class TransfersService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly issuances: IssuancesService,
    private readonly investors: InvestorsService,
    private readonly eligibility: EligibilityService,
    private readonly tenants: TenantDirectory,
    private readonly ledger: LedgerWriter,
    private readonly workflow: Workflow,
    private readonly audit: AuditWriter,
    private readonly outbox: Outbox,
    private readonly users: UserDirectory,
  ) {}

  /** An investor sees the transfers it asked for. */
  private scopeOf(user: RequestUser): SQL | undefined {
    if (user.permissions.get('transfer:read') !== 'own') return undefined;
    return user.investorId ? eq(transferRequest.fromInvestorId, user.investorId) : sql`false`;
  }

  async list(
    filters: { issuanceId?: string; status?: TransferStatus },
    pagination: Pagination,
  ): Promise<Page<TransferWithNames>> {
    const conditions = [
      this.scopeOf(currentUser()),
      filters.issuanceId ? eq(transferRequest.issuanceId, filters.issuanceId) : undefined,
      filters.status ? eq(transferRequest.status, filters.status) : undefined,
    ].filter((condition): condition is SQL => condition !== undefined);
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    return withCurrentTenant(this.db, async (tx) => {
      const [{ total } = { total: 0 }] = await tx
        .select({ total: count() })
        .from(transferRequest)
        .where(where);
      const rows = await this.withNames(tx)
        .where(where)
        .orderBy(desc(transferRequest.updatedAt), desc(transferRequest.id))
        .limit(pagination.pageSize)
        .offset(offsetOf(pagination));
      return { data: rows.map((row) => this.flatten(row)), meta: { ...pagination, total } };
    });
  }

  get(id: string): Promise<TransferWithNames> {
    return withCurrentTenant(this.db, (tx) => this.find(tx, id));
  }

  /** A draft by the holder; an unknown code or its own code is refused at once. */
  create(issuanceId: string, input: TransferInput): Promise<TransferWithNames> {
    const user = currentUser();
    if (!user.investorId) throw new AppError('PERMISSION_DENIED');
    const fromInvestorId = user.investorId;
    return withCurrentTenant(this.db, async (tx, tenantId) => {
      await this.holdingOf(tx, issuanceId, fromInvestorId);
      const detail = await this.issuances.findForRegistry(tx, issuanceId);
      const toInvestorId = await this.recipientOf(tx, input.recipientCode, fromInvestorId);
      const [created] = await tx
        .insert(transferRequest)
        .values({
          tenantId,
          issuanceId,
          fromInvestorId,
          toInvestorId,
          recipientCode: input.recipientCode.trim().toUpperCase(),
          quantity: input.quantity,
          indicativePrice: input.indicativePrice ?? null,
          indicativePriceCurrency: input.indicativePrice ? detail.issuance.currency : null,
          requestedBy: user.userId,
          createdBy: user.userId,
        })
        .returning();
      await this.workflow.start(tx, transferMachine, {
        tenantId,
        resourceId: created!.id,
        to: 'DRAFT',
      });
      await this.audit.recordIn(tx, {
        tenantId,
        action: 'TRANSFER_CREATED',
        resourceType: 'transfer',
        resourceId: created!.id,
        newValue: { issuanceId, quantity: input.quantity },
        result: 'SUCCESS',
      });
      return this.find(tx, created!.id);
    });
  }

  update(id: string, version: number, changes: Partial<TransferInput>): Promise<TransferWithNames> {
    return withCurrentTenant(this.db, async (tx, tenantId) => {
      const found = await this.find(tx, id, true);
      if (found.status !== 'DRAFT') throw new AppError('INVALID_STATE_TRANSITION');
      if (found.version !== version) throw new AppError('VERSION_CONFLICT');
      const toInvestorId =
        changes.recipientCode !== undefined
          ? await this.recipientOf(tx, changes.recipientCode, found.fromInvestorId)
          : found.toInvestorId;
      await tx
        .update(transferRequest)
        .set({
          ...(changes.quantity !== undefined ? { quantity: changes.quantity } : {}),
          ...(changes.indicativePrice !== undefined
            ? { indicativePrice: changes.indicativePrice }
            : {}),
          ...(changes.recipientCode !== undefined
            ? { toInvestorId, recipientCode: changes.recipientCode.trim().toUpperCase() }
            : {}),
          version: sql`${transferRequest.version} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(transferRequest.id, id));
      await this.audit.recordIn(tx, {
        tenantId,
        action: 'TRANSFER_UPDATED',
        resourceType: 'transfer',
        resourceId: id,
        newValue: { quantity: changes.quantity },
        result: 'SUCCESS',
      });
      return this.find(tx, id);
    });
  }

  /**
   * Submission (SPEC §11.1, §11.3): the checks, the sender's KYC/KYB, the recipient's eligibility
   * (recorded), the maximum per investor, then the units are blocked and the request goes to
   * compliance review — all at once.
   */
  submit(id: string): Promise<TransferWithNames> {
    return this.transition(id, 'SUBMITTED', null, async (tx, tenantId, found, detail) => {
      const failure = checkTransfer({
        issuanceStatus: detail.issuance.status,
        transfersAllowed: detail.rules.transfersAllowed,
        lockupEndDate: detail.rules.lockupEndDate,
        today: await this.tenants.todayOf(tx, tenantId),
        quantity: found.quantity,
        fromInvestorId: found.fromInvestorId,
        toInvestorId: found.toInvestorId,
      });
      if (failure) throw new AppError(failure);
      await this.requireSenderKyc(tx, tenantId, found, detail);
      const assessment = await this.requireRecipient(tx, tenantId, found, detail, true);
      const account = await this.holdingOf(tx, found.issuanceId, found.fromInvestorId);
      const [block] = await this.ledger.post(tx, tenantId, found.issuanceId, [
        {
          type: 'BLOCK',
          sourceAccountId: account.accountId,
          destinationAccountId: account.accountId,
          quantity: found.quantity,
          businessReference: `transfer:${found.id}`,
          metadata: { transferId: found.id },
        },
      ]);
      await tx
        .update(transferRequest)
        .set({
          blockEntryId: block!.id,
          eligibilityAssessmentId: assessment.id,
          submittedAt: new Date(),
        })
        .where(eq(transferRequest.id, id));
      return { then: 'COMPLIANCE_REVIEW', event: TRANSFER_EVENTS.submitted };
    });
  }

  /**
   * Approval by a Compliance Officer or an Issuer Administrator: the recipient's eligibility is
   * checked again, then UNBLOCK + TRANSFER and APPROVED → EXECUTED in one transaction.
   */
  approve(id: string): Promise<TransferWithNames> {
    return this.transition(id, 'APPROVED', null, async (tx, tenantId, found, detail) => {
      const assessment = await this.requireRecipient(tx, tenantId, found, detail, false);
      const sender = await this.holdingOf(tx, found.issuanceId, found.fromInvestorId);
      const currency = detail.issuance.currency!;
      const recipientAccount = await this.ledger.account(
        tx,
        tenantId,
        found.issuanceId,
        found.toInvestorId,
        currency,
      );
      const amount = transferredAcquisition(
        sender.acquisitionAmount,
        sender.held,
        found.quantity,
        isCurrencyCode(currency) ? CURRENCY_MINOR_UNITS[currency] : 2,
      );
      const reference = {
        businessReference: `transfer:${found.id}`,
        metadata: { transferId: found.id },
      };
      const [, transfer] = await this.ledger.post(tx, tenantId, found.issuanceId, [
        {
          type: 'UNBLOCK',
          sourceAccountId: sender.accountId,
          destinationAccountId: sender.accountId,
          quantity: found.quantity,
          ...reference,
        },
        {
          type: 'TRANSFER',
          sourceAccountId: sender.accountId,
          destinationAccountId: recipientAccount,
          quantity: found.quantity,
          amount,
          ...reference,
        },
      ]);
      await this.ledger.assertConsistent(tx, found.issuanceId, detail.terms.totalUnits);
      await tx
        .update(transferRequest)
        .set({
          transferEntryId: transfer!.id,
          eligibilityAssessmentId: assessment.id,
          reviewedBy: currentUser().userId,
          reviewedAt: new Date(),
        })
        .where(eq(transferRequest.id, id));
      return { then: 'EXECUTED', event: TRANSFER_EVENTS.executed };
    });
  }

  reject(id: string, reason: string): Promise<TransferWithNames> {
    return this.transition(id, 'REJECTED', reason, async (tx, tenantId, found) => {
      await this.unblock(tx, tenantId, found);
      await tx
        .update(transferRequest)
        .set({
          rejectionReason: reason.trim(),
          reviewedBy: currentUser().userId,
          reviewedAt: new Date(),
        })
        .where(eq(transferRequest.id, id));
      return { event: TRANSFER_EVENTS.rejected };
    });
  }

  /** The investor cancels its own request; the issuer's staff with a reason. Units unblocked. */
  cancel(id: string, reason: string | null): Promise<TransferWithNames> {
    const byInvestor = currentUser().permissions.get('transfer:cancel') === 'own';
    if (!byInvestor && !reason?.trim()) throw new AppError('COMMENT_REQUIRED');
    return this.transition(id, 'CANCELLED', reason, async (tx, tenantId, found) => {
      await this.unblock(tx, tenantId, found);
      await tx
        .update(transferRequest)
        .set({ cancellationReason: reason?.trim() || 'CANCELLED_BY_INVESTOR' })
        .where(eq(transferRequest.id, id));
      return { event: byInvestor ? null : TRANSFER_EVENTS.cancelledByIssuer };
    });
  }

  transitions(id: string) {
    return withCurrentTenant(this.db, async (tx) => {
      await this.find(tx, id);
      const rows = await tx
        .select()
        .from(workflowTransition)
        .where(
          and(
            eq(workflowTransition.resourceType, 'transfer'),
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

  /**
   * One transition (and the automatic one that follows it), with the issuance locked first,
   * audited, and the event published — in one transaction.
   */
  private transition(
    id: string,
    to: TransferStatus,
    comment: string | null,
    apply: (
      tx: Transaction,
      tenantId: string,
      found: TransferWithNames,
      detail: IssuanceDetail,
    ) => Promise<{ then?: TransferStatus; event: string | null }>,
  ): Promise<TransferWithNames> {
    return withCurrentTenant(this.db, async (tx, tenantId) => {
      const peek = await this.find(tx, id);
      const detail = await this.issuances.findForRegistry(tx, peek.issuanceId, true);
      const found = await this.find(tx, id, true);
      const statuses: [TransferStatus, TransferStatus][] = [[found.status as TransferStatus, to]];
      await this.workflow.transition(tx, transferMachine, {
        tenantId,
        resourceId: id,
        from: statuses[0]![0],
        to,
        comment,
      });
      const { then, event } = await apply(tx, tenantId, found, detail);
      if (then) {
        await this.workflow.transition(tx, transferMachine, {
          tenantId,
          resourceId: id,
          from: to,
          to: then,
        });
        statuses.push([to, then]);
      }
      await tx
        .update(transferRequest)
        .set({
          status: then ?? to,
          version: sql`${transferRequest.version} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(transferRequest.id, id));
      for (const [from, status] of statuses) {
        await this.audit.recordIn(tx, {
          tenantId,
          action: `TRANSFER_${status}`,
          resourceType: 'transfer',
          resourceId: id,
          oldValue: { status: from },
          newValue: { status, quantity: found.quantity },
          result: 'SUCCESS',
          ...(comment ? { reason: 'COMMENTED' } : {}),
        });
      }
      if (event) {
        await this.outbox.publish(tx, {
          tenantId,
          eventType: event,
          aggregateType: 'transfer',
          aggregateId: id,
          payload: {
            code: detail.issuance.code,
            units: parseDecimal(found.quantity).toString(),
            fromInvestorId: found.fromInvestorId,
            toInvestorId: found.toInvestorId,
          },
        });
      }
      return this.find(tx, id);
    });
  }

  /** §11.3 "KYC/KYB valide des deux parties": the sender's own KYC/KYB. */
  private async requireSenderKyc(
    tx: Transaction,
    tenantId: string,
    found: TransferWithNames,
    detail: IssuanceDetail,
  ): Promise<void> {
    const rules = ruleSetOf(detail.rules);
    await this.eligibility.requireEligible(tx, tenantId, {
      investorId: found.fromInvestorId,
      issuanceId: found.issuanceId,
      context: 'TRANSFER',
      ruleSet: {
        ...rules,
        professionalOnly: false,
        allowedCountries: [],
        excludedCountries: [],
        allowedInvestorTypes: [],
        allowedClassifications: [],
        kycRequired: true,
        kycMinRemainingValidityDays: 0,
        maxInvestors: null,
      },
    });
  }

  /**
   * The recipient's eligibility with the issuance's rules (recorded) and the maximum per
   * investor. For the sender (`hideReasons`), a refusal is only RECIPIENT_NOT_ELIGIBLE (D-010).
   */
  private async requireRecipient(
    tx: Transaction,
    tenantId: string,
    found: TransferWithNames,
    detail: IssuanceDetail,
    hideReasons: boolean,
  ) {
    const holders = await tx
      .select({ investorId: position.investorId, held: position.quantityHeld })
      .from(position)
      .where(
        and(
          eq(position.issuanceId, found.issuanceId),
          isNotNull(position.investorId),
          gt(position.quantityHeld, '0'),
        ),
      );
    const recipientHolding = holders.find((row) => row.investorId === found.toInvestorId);
    try {
      const assessment = await this.eligibility.requireEligible(tx, tenantId, {
        investorId: found.toInvestorId,
        issuanceId: found.issuanceId,
        context: 'TRANSFER',
        ruleSet: ruleSetOf(detail.rules),
        currentInvestorCount: holders.filter((row) => row.investorId !== found.toInvestorId).length,
        alreadyInvestor: recipientHolding !== undefined,
      });
      if (
        exceedsHoldingLimit(
          recipientHolding?.held ?? '0',
          found.quantity,
          detail.terms.nominalValue!,
          detail.terms.maxAmountPerInvestor,
        )
      ) {
        throw new AppError(hideReasons ? 'RECIPIENT_NOT_ELIGIBLE' : 'SUBSCRIPTION_LIMIT_EXCEEDED');
      }
      return assessment;
    } catch (error) {
      if (hideReasons && error instanceof AppError && error.code === 'ELIGIBILITY_FAILED')
        throw new AppError('RECIPIENT_NOT_ELIGIBLE');
      throw error;
    }
  }

  private async unblock(tx: Transaction, tenantId: string, found: TransferWithNames) {
    if (!BLOCKED_STATUSES.includes(found.status as TransferStatus)) return;
    const account = await this.holdingOf(tx, found.issuanceId, found.fromInvestorId);
    await this.ledger.post(tx, tenantId, found.issuanceId, [
      {
        type: 'UNBLOCK',
        sourceAccountId: account.accountId,
        destinationAccountId: account.accountId,
        quantity: found.quantity,
        businessReference: `transfer:${found.id}`,
        metadata: { transferId: found.id },
      },
    ]);
  }

  /** The sender's position; without one, nothing is available to transfer. */
  private async holdingOf(tx: Transaction, issuanceId: string, investorId: string) {
    const [row] = await tx
      .select({
        accountId: position.accountId,
        held: position.quantityHeld,
        acquisitionAmount: position.acquisitionAmount,
      })
      .from(position)
      .where(and(eq(position.issuanceId, issuanceId), eq(position.investorId, investorId)));
    if (!row) throw new AppError('INSUFFICIENT_AVAILABLE_QUANTITY');
    return row;
  }

  private async recipientOf(tx: Transaction, code: string, fromInvestorId: string) {
    const toInvestorId = await this.investors.byRecipientCode(tx, code);
    if (!toInvestorId) throw new AppError('RECIPIENT_CODE_UNKNOWN');
    if (toInvestorId === fromInvestorId) throw new AppError('SELF_TRANSFER_FORBIDDEN');
    return toInvestorId;
  }

  private withNames(tx: Transaction) {
    return tx
      .select({
        transfer: transferRequest,
        issuanceName: issuance.name,
        issuanceCode: issuance.code,
        fromInvestorName: investor.legalName,
        toInvestorName: recipient.legalName,
      })
      .from(transferRequest)
      .innerJoin(issuance, eq(issuance.id, transferRequest.issuanceId))
      .innerJoin(investor, eq(investor.id, transferRequest.fromInvestorId))
      .innerJoin(recipient, eq(recipient.id, transferRequest.toInvestorId));
  }

  private flatten(row: {
    transfer: TransferRow;
    issuanceName: string;
    issuanceCode: string;
    fromInvestorName: string;
    toInvestorName: string;
  }): TransferWithNames {
    const own = currentUser().permissions.get('transfer:read') === 'own';
    return {
      ...row.transfer,
      // The sender knows the code it typed, never the recipient's name (D-010).
      toInvestorId: own ? '' : row.transfer.toInvestorId,
      issuanceName: row.issuanceName,
      issuanceCode: row.issuanceCode,
      fromInvestorName: row.fromInvestorName,
      toInvestorName: own ? null : row.toInvestorName,
    };
  }

  private async find(tx: Transaction, id: string, lock = false): Promise<TransferWithNames> {
    const scope = this.scopeOf(currentUser());
    const where = scope ? and(eq(transferRequest.id, id), scope) : eq(transferRequest.id, id);
    if (lock)
      await tx.select({ id: transferRequest.id }).from(transferRequest).where(where).for('update');
    const [row] = await this.withNames(tx).where(where);
    if (!row) throw new AppError('RESOURCE_NOT_FOUND');
    // The use cases need the real recipient: only the views hide it.
    return { ...this.flatten(row), toInvestorId: row.transfer.toInvestorId };
  }
}
