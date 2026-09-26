import { Inject, Injectable } from '@nestjs/common';
import { parseDecimal } from '@virtus/shared';
import { and, asc, count, desc, eq, inArray, ne, sql, sum, type SQL } from 'drizzle-orm';
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
import { EligibilityService, investor } from '../../investor-compliance/index.js';
import {
  issuance,
  IssuancesService,
  ruleSetOf,
  type IssuanceDetail,
} from '../../issuance/index.js';
import { checkSubscription } from '../domain/subscription-checks.js';
import {
  ACTIVE_SUBSCRIPTION_STATUSES,
  CANCELLABLE_BY_INVESTOR,
  subscriptionMachine,
  type SubscriptionStatus,
} from '../domain/subscription-machine.js';
import { allocationRound, subscription } from '../infrastructure/schema.js';
import { LedgerWriter } from './ledger-writer.js';
import { SUBSCRIPTION_EVENTS } from './subscription-event-types.js';

export type SubscriptionRow = typeof subscription.$inferSelect;
export type SubscriptionWithNames = SubscriptionRow & {
  issuanceName: string;
  issuanceCode: string;
  investorName: string;
};

export interface SubscriptionInput {
  requestedUnits: string;
  requestedAmount: string;
  paymentReference?: string | null;
  comment?: string | null;
}

/** Subscriptions that can still be cancelled (all but the final ones and the paid ones). */
const OPEN_STATUSES: SubscriptionStatus[] = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'APPROVED',
  'PAYMENT_PENDING',
];

/**
 * Subscriptions (SPEC §9): an investor prepares and submits; the issuer's staff review; an Issuer
 * Administrator approves or rejects with a reason. Every submission is checked (§9.3) and the
 * investor's eligibility is recorded (SPEC §8.4); the issuance row is locked meanwhile so that the
 * investor's cap can never be exceeded by two submissions at the same time.
 */
@Injectable()
export class SubscriptionsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly issuances: IssuancesService,
    private readonly eligibility: EligibilityService,
    private readonly tenants: TenantDirectory,
    private readonly workflow: Workflow,
    private readonly audit: AuditWriter,
    private readonly outbox: Outbox,
    private readonly users: UserDirectory,
    private readonly ledger: LedgerWriter,
  ) {}

  /** An investor only sees its own subscriptions. */
  private scopeOf(user: RequestUser): SQL | undefined {
    if (user.permissions.get('subscription:read') !== 'own') return undefined;
    return user.investorId ? eq(subscription.investorId, user.investorId) : sql`false`;
  }

  async list(
    filters: { issuanceId?: string; investorId?: string; status?: SubscriptionStatus },
    pagination: Pagination,
  ): Promise<Page<SubscriptionWithNames>> {
    const conditions = [
      this.scopeOf(currentUser()),
      filters.issuanceId ? eq(subscription.issuanceId, filters.issuanceId) : undefined,
      filters.investorId ? eq(subscription.investorId, filters.investorId) : undefined,
      filters.status ? eq(subscription.status, filters.status) : undefined,
    ].filter((condition): condition is SQL => condition !== undefined);
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    return withCurrentTenant(this.db, async (tx) => {
      const [{ total } = { total: 0 }] = await tx
        .select({ total: count() })
        .from(subscription)
        .where(where);
      const rows = await this.withNames(tx)
        .where(where)
        .orderBy(desc(subscription.updatedAt), desc(subscription.id))
        .limit(pagination.pageSize)
        .offset(offsetOf(pagination));
      return { data: rows.map(flatten), meta: { ...pagination, total } };
    });
  }

  get(id: string): Promise<SubscriptionWithNames> {
    return withCurrentTenant(this.db, (tx) => this.find(tx, id));
  }

  /** A draft, by the investor, on an issuance it is invited to and which is open. */
  async create(issuanceId: string, input: SubscriptionInput): Promise<SubscriptionWithNames> {
    const user = currentUser();
    if (!user.investorId) throw new AppError('PERMISSION_DENIED');
    const investorId = user.investorId;
    return withCurrentTenant(this.db, async (tx, tenantId) => {
      // Visible only when the investor is invited (issuance scope): otherwise 404.
      const found = await this.issuances.find(tx, issuanceId);
      if (found.issuance.status !== 'SUBSCRIPTION_OPEN')
        throw new AppError('SUBSCRIPTION_WINDOW_CLOSED');
      const [created] = await tx
        .insert(subscription)
        .values({
          tenantId,
          issuanceId,
          investorId,
          requestedUnits: input.requestedUnits,
          requestedAmount: input.requestedAmount,
          currency: found.issuance.currency!,
          paymentReference: input.paymentReference ?? null,
          comment: input.comment ?? null,
          createdBy: user.userId,
        })
        .returning();
      await this.workflow.start(tx, subscriptionMachine, {
        tenantId,
        resourceId: created!.id,
        to: 'DRAFT',
      });
      await this.audit.recordIn(tx, {
        tenantId,
        action: 'SUBSCRIPTION_CREATED',
        resourceType: 'subscription',
        resourceId: created!.id,
        newValue: {
          issuanceId,
          requestedUnits: input.requestedUnits,
          requestedAmount: input.requestedAmount,
        },
        result: 'SUCCESS',
      });
      return this.find(tx, created!.id);
    });
  }

  async update(
    id: string,
    version: number,
    changes: Partial<SubscriptionInput>,
  ): Promise<SubscriptionWithNames> {
    return withCurrentTenant(this.db, async (tx, tenantId) => {
      const found = await this.find(tx, id, true);
      if (found.status !== 'DRAFT') throw new AppError('INVALID_STATE_TRANSITION');
      if (found.version !== version) throw new AppError('VERSION_CONFLICT');
      await tx
        .update(subscription)
        .set({ ...changes, version: sql`${subscription.version} + 1`, updatedAt: new Date() })
        .where(eq(subscription.id, id));
      await this.audit.recordIn(tx, {
        tenantId,
        action: 'SUBSCRIPTION_UPDATED',
        resourceType: 'subscription',
        resourceId: id,
        newValue: { ...changes },
        result: 'SUCCESS',
      });
      return this.find(tx, id);
    });
  }

  /**
   * Submission by the investor: documents accepted and eligibility declared (SPEC §9.1), checks of
   * §9.3, then the eligibility engine (refused with the failed rules, the decision being kept).
   */
  async submit(
    id: string,
    declarations: { documentsAccepted: boolean; eligibilityDeclared: boolean },
  ) {
    const missing = [
      ...(declarations.documentsAccepted
        ? []
        : [{ code: 'DOCUMENTS_NOT_ACCEPTED', field: 'documentsAccepted' }]),
      ...(declarations.eligibilityDeclared
        ? []
        : [{ code: 'ELIGIBILITY_NOT_DECLARED', field: 'eligibilityDeclared' }]),
    ];
    if (missing.length > 0) throw new AppError('VALIDATION_FAILED', missing);
    return this.transition(id, 'SUBMITTED', null, async (tx, tenantId, found, issuanceDetail) => {
      await this.checkAgainstIssuance(tx, tenantId, found, issuanceDetail);
      const assessment = await this.requireEligible(tx, tenantId, found, issuanceDetail);
      const now = new Date();
      await tx
        .update(subscription)
        .set({
          submittedAt: now,
          documentsAcceptedAt: now,
          eligibilityDeclaredAt: now,
          eligibilityAssessmentId: assessment.id,
        })
        .where(eq(subscription.id, id));
      return { event: SUBSCRIPTION_EVENTS.submitted };
    });
  }

  startReview(id: string) {
    return this.transition(id, 'UNDER_REVIEW', null, async (tx) => {
      await tx
        .update(subscription)
        .set({ reviewedBy: currentUser().userId })
        .where(eq(subscription.id, id));
      return { event: null };
    });
  }

  /** Approval: the eligibility is checked again (a KYC may have expired since the submission). */
  approve(id: string) {
    return this.transition(id, 'APPROVED', null, async (tx, tenantId, found, issuanceDetail) => {
      const assessment = await this.requireEligible(tx, tenantId, found, issuanceDetail);
      await tx
        .update(subscription)
        .set({
          decidedBy: currentUser().userId,
          decidedAt: new Date(),
          eligibilityAssessmentId: assessment.id,
        })
        .where(eq(subscription.id, id));
      return { event: SUBSCRIPTION_EVENTS.decided, payload: { decision: 'APPROVED' } };
    });
  }

  reject(id: string, reason: string) {
    return this.transition(id, 'REJECTED', reason, async (tx) => {
      await tx
        .update(subscription)
        .set({
          decidedBy: currentUser().userId,
          decidedAt: new Date(),
          rejectionReason: reason.trim(),
        })
        .where(eq(subscription.id, id));
      return { event: SUBSCRIPTION_EVENTS.decided, payload: { decision: 'REJECTED' } };
    });
  }

  /**
   * The investor cancels before approval; the issuer's staff until the payment, with a reason. An
   * approved subscription cannot be cancelled while an allocation round is being prepared (its
   * lines would be out of date); a pending payment gives its units back to the treasury (UNBLOCK
   * then CANCELLATION, D-009).
   */
  cancel(id: string, reason: string | null) {
    const user = currentUser();
    const byInvestor = user.permissions.get('subscription:cancel') === 'own';
    if (!byInvestor && !reason?.trim()) throw new AppError('COMMENT_REQUIRED');
    return this.transition(id, 'CANCELLED', reason, async (tx, tenantId, found, detail) => {
      if (byInvestor && !CANCELLABLE_BY_INVESTOR.includes(found.status as SubscriptionStatus)) {
        throw new AppError('INVALID_STATE_TRANSITION');
      }
      if (found.status === 'APPROVED') await this.refuseDuringAllocation(tx, found.issuanceId);
      if (found.status === 'PAYMENT_PENDING') await this.giveBackUnits(tx, tenantId, found, detail);
      await tx
        .update(subscription)
        .set({
          cancellationReason: reason?.trim() || (byInvestor ? 'CANCELLED_BY_INVESTOR' : null),
        })
        .where(eq(subscription.id, id));
      return { event: byInvestor ? null : SUBSCRIPTION_EVENTS.cancelledByIssuer };
    });
  }

  /**
   * Validation of an allocation round (SPEC §10.1, D-009), in its transaction: units allocated →
   * PAYMENT_PENDING with the amount due; nothing allocated → CANCELLED with NOT_ALLOCATED.
   */
  async applyAllocation(
    tx: Transaction,
    tenantId: string,
    row: SubscriptionWithNames,
    allocatedUnits: string,
    amountDue: string,
  ): Promise<void> {
    const allocated = !parseDecimal(allocatedUnits).isZero();
    const to: SubscriptionStatus = allocated ? 'PAYMENT_PENDING' : 'CANCELLED';
    await this.workflow.transition(tx, subscriptionMachine, {
      tenantId,
      resourceId: row.id,
      from: row.status as SubscriptionStatus,
      to,
      comment: allocated ? null : 'NOT_ALLOCATED',
    });
    await tx
      .update(subscription)
      .set({
        status: to,
        allocatedUnits,
        amountDue: allocated ? amountDue : null,
        ...(allocated ? {} : { cancellationReason: 'NOT_ALLOCATED' }),
        version: sql`${subscription.version} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(subscription.id, row.id));
    await this.audit.recordIn(tx, {
      tenantId,
      action: `SUBSCRIPTION_${to}`,
      resourceType: 'subscription',
      resourceId: row.id,
      oldValue: { status: row.status },
      newValue: { status: to, allocatedUnits, ...(allocated ? { amountDue } : {}) },
      result: 'SUCCESS',
      ...(allocated ? {} : { reason: 'NOT_ALLOCATED' }),
    });
    await this.outbox.publish(tx, {
      tenantId,
      eventType: allocated ? SUBSCRIPTION_EVENTS.allocated : SUBSCRIPTION_EVENTS.notAllocated,
      aggregateType: 'subscription',
      aggregateId: row.id,
      payload: {
        investorId: row.investorId,
        code: row.issuanceCode,
        units: parseDecimal(allocatedUnits).toString(),
      },
    });
  }

  /** Approved subscriptions of an issuance, locked, in the order they were submitted. */
  async approvedFor(tx: Transaction, issuanceId: string): Promise<SubscriptionWithNames[]> {
    const where = and(eq(subscription.issuanceId, issuanceId), eq(subscription.status, 'APPROVED'));
    await tx.select({ id: subscription.id }).from(subscription).where(where).for('update');
    const rows = await this.withNames(tx)
      .where(where)
      .orderBy(asc(subscription.submittedAt), asc(subscription.id));
    return rows.map(flatten);
  }

  /** Subscriptions of an issuance still waiting for a decision of the issuer. */
  async undecidedCount(tx: Transaction, issuanceId: string): Promise<number> {
    const [row] = await tx
      .select({ total: count() })
      .from(subscription)
      .where(
        and(
          eq(subscription.issuanceId, issuanceId),
          inArray(subscription.status, ['SUBMITTED', 'UNDER_REVIEW']),
        ),
      );
    return row?.total ?? 0;
  }

  /** Subscriptions by identifier (the lines of an allocation round), locked when asked. */
  async byIds(
    tx: Transaction,
    ids: readonly string[],
    lock = false,
  ): Promise<Map<string, SubscriptionWithNames>> {
    if (ids.length === 0) return new Map();
    const where = inArray(subscription.id, [...ids]);
    if (lock)
      await tx.select({ id: subscription.id }).from(subscription).where(where).for('update');
    const rows = await this.withNames(tx).where(where);
    return new Map(rows.map((row) => [row.subscription.id, flatten(row)]));
  }

  private async refuseDuringAllocation(tx: Transaction, issuanceId: string): Promise<void> {
    const [inProgress] = await tx
      .select({ id: allocationRound.id })
      .from(allocationRound)
      .where(
        and(
          eq(allocationRound.issuanceId, issuanceId),
          inArray(allocationRound.status, ['DRAFT', 'PROPOSED']),
        ),
      );
    if (inProgress) {
      throw new AppError('INVALID_STATE_TRANSITION', [
        { code: 'ALLOCATION_ROUND_IN_PROGRESS', field: null },
      ]);
    }
  }

  /** Payment never received (D-009): the blocked units go back to the issuer's treasury. */
  private async giveBackUnits(
    tx: Transaction,
    tenantId: string,
    found: SubscriptionWithNames,
    detail: IssuanceDetail,
  ): Promise<void> {
    const units = found.allocatedUnits!;
    const { issuanceId, currency } = found;
    const account = await this.ledger.account(tx, tenantId, issuanceId, found.investorId, currency);
    const treasury = await this.ledger.account(tx, tenantId, issuanceId, null, currency);
    const reference = {
      businessReference: `subscription:${found.id}`,
      metadata: { subscriptionId: found.id },
    };
    await this.ledger.post(tx, tenantId, issuanceId, [
      {
        type: 'UNBLOCK',
        sourceAccountId: account,
        destinationAccountId: account,
        quantity: units,
        ...reference,
      },
      {
        type: 'CANCELLATION',
        sourceAccountId: account,
        destinationAccountId: treasury,
        quantity: units,
        amount: found.amountDue ?? '0',
        ...reference,
      },
    ]);
    await this.ledger.assertConsistent(tx, issuanceId, detail.terms.totalUnits);
  }

  /**
   * The issuance was cancelled: its subscriptions still open are cancelled by the system
   * (SPEC §7.1). Runs in the delivery transaction of the issuance's event; running it twice
   * changes nothing.
   */
  async cancelForIssuance(tx: Transaction, tenantId: string, issuanceId: string): Promise<number> {
    const open = await tx
      .select({ id: subscription.id, status: subscription.status })
      .from(subscription)
      .where(
        and(eq(subscription.issuanceId, issuanceId), inArray(subscription.status, OPEN_STATUSES)),
      )
      .for('update');
    for (const row of open) {
      await this.workflow.transition(tx, subscriptionMachine, {
        tenantId,
        resourceId: row.id,
        from: row.status as SubscriptionStatus,
        to: 'CANCELLED',
      });
      await tx
        .update(subscription)
        .set({
          status: 'CANCELLED',
          cancellationReason: 'ISSUANCE_CANCELLED',
          updatedAt: new Date(),
        })
        .where(eq(subscription.id, row.id));
      await this.audit.recordIn(tx, {
        tenantId,
        actorUserId: null,
        action: 'SUBSCRIPTION_CANCELLED',
        resourceType: 'subscription',
        resourceId: row.id,
        oldValue: { status: row.status },
        newValue: { status: 'CANCELLED' },
        result: 'SUCCESS',
        reason: 'ISSUANCE_CANCELLED',
      });
    }
    return open.length;
  }

  /** History of the statuses (who, when, comment). */
  transitions(id: string) {
    return withCurrentTenant(this.db, async (tx) => {
      await this.find(tx, id);
      const rows = await tx
        .select()
        .from(workflowTransition)
        .where(
          and(
            eq(workflowTransition.resourceType, 'subscription'),
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

  /** One transition, with the issuance locked, recorded and audited in the same transaction. */
  private transition(
    id: string,
    to: SubscriptionStatus,
    comment: string | null,
    apply: (
      tx: Transaction,
      tenantId: string,
      found: SubscriptionWithNames,
      issuanceDetail: IssuanceDetail,
    ) => Promise<{ event: string | null; payload?: Record<string, string> }>,
  ): Promise<SubscriptionWithNames> {
    return withCurrentTenant(this.db, async (tx, tenantId) => {
      const peek = await this.find(tx, id);
      // The issuance first, then the subscription: always the same order, never a deadlock.
      const issuanceDetail = await this.issuances.find(tx, peek.issuanceId, true);
      const found = await this.find(tx, id, true);
      const from = found.status as SubscriptionStatus;
      await this.workflow.transition(tx, subscriptionMachine, {
        tenantId,
        resourceId: id,
        from,
        to,
        comment,
      });
      const { event, payload } = await apply(tx, tenantId, found, issuanceDetail);
      await tx
        .update(subscription)
        .set({ status: to, version: sql`${subscription.version} + 1`, updatedAt: new Date() })
        .where(eq(subscription.id, id));
      await this.audit.recordIn(tx, {
        tenantId,
        action: `SUBSCRIPTION_${to}`,
        resourceType: 'subscription',
        resourceId: id,
        oldValue: { status: from },
        newValue: { status: to },
        result: 'SUCCESS',
        ...(comment ? { reason: 'COMMENTED' } : {}),
      });
      if (event) {
        await this.outbox.publish(tx, {
          tenantId,
          eventType: event,
          aggregateType: 'subscription',
          aggregateId: id,
          payload: { investorId: found.investorId, code: found.issuanceCode, ...(payload ?? {}) },
        });
      }
      return this.find(tx, id);
    });
  }

  /** Checks of SPEC §9.3 against the issuance and the investor's other active subscriptions. */
  private async checkAgainstIssuance(
    tx: Transaction,
    tenantId: string,
    found: SubscriptionWithNames,
    detail: IssuanceDetail,
  ): Promise<void> {
    const [others] = await tx
      .select({ amount: sum(subscription.requestedAmount) })
      .from(subscription)
      .where(
        and(
          eq(subscription.issuanceId, found.issuanceId),
          eq(subscription.investorId, found.investorId),
          ne(subscription.id, found.id),
          inArray(subscription.status, [...ACTIVE_SUBSCRIPTION_STATUSES]),
        ),
      );
    const failure = checkSubscription({
      issuanceStatus: detail.issuance.status,
      today: await this.tenants.todayOf(tx, tenantId),
      subscriptionStartDate: detail.terms.subscriptionStartDate,
      subscriptionEndDate: detail.terms.subscriptionEndDate,
      nominalValue: detail.terms.nominalValue!,
      totalUnits: detail.terms.totalUnits!,
      maximumAmount: detail.terms.maximumAmount,
      minSubscriptionAmount: detail.terms.minSubscriptionAmount,
      maxAmountPerInvestor: detail.terms.maxAmountPerInvestor,
      requestedUnits: found.requestedUnits,
      requestedAmount: found.requestedAmount,
      investorActiveAmount: others?.amount ?? '0',
    });
    if (failure) {
      throw new AppError(
        failure.code,
        failure.meta ? [{ code: failure.code, field: null, meta: failure.meta }] : [],
      );
    }
  }

  /** The engine with the issuance's rules, counting the investors already subscribing. */
  private async requireEligible(
    tx: Transaction,
    tenantId: string,
    found: SubscriptionWithNames,
    detail: IssuanceDetail,
  ) {
    const subscribers = await tx
      .selectDistinct({ investorId: subscription.investorId })
      .from(subscription)
      .where(
        and(
          eq(subscription.issuanceId, found.issuanceId),
          ne(subscription.id, found.id),
          inArray(subscription.status, [...ACTIVE_SUBSCRIPTION_STATUSES]),
        ),
      );
    return this.eligibility.requireEligible(tx, tenantId, {
      investorId: found.investorId,
      issuanceId: found.issuanceId,
      ruleSet: ruleSetOf(detail.rules),
      context: 'SUBSCRIPTION',
      currentInvestorCount: subscribers.filter((row) => row.investorId !== found.investorId).length,
      alreadyInvestor: subscribers.some((row) => row.investorId === found.investorId),
    });
  }

  private withNames(tx: Transaction) {
    return tx
      .select({
        subscription,
        issuanceName: issuance.name,
        issuanceCode: issuance.code,
        investorName: investor.legalName,
      })
      .from(subscription)
      .innerJoin(issuance, eq(issuance.id, subscription.issuanceId))
      .innerJoin(investor, eq(investor.id, subscription.investorId));
  }

  private async find(tx: Transaction, id: string, lock = false): Promise<SubscriptionWithNames> {
    const scope = this.scopeOf(currentUser());
    const where = scope ? and(eq(subscription.id, id), scope) : eq(subscription.id, id);
    // The subscription row alone is locked (PostgreSQL refuses "FOR UPDATE OF schema.table").
    if (lock)
      await tx.select({ id: subscription.id }).from(subscription).where(where).for('update');
    const [row] = await this.withNames(tx).where(where);
    if (!row) throw new AppError('RESOURCE_NOT_FOUND');
    return flatten(row);
  }
}

function flatten(row: {
  subscription: SubscriptionRow;
  issuanceName: string;
  issuanceCode: string;
  investorName: string;
}): SubscriptionWithNames {
  return {
    ...row.subscription,
    issuanceName: row.issuanceName,
    issuanceCode: row.issuanceCode,
    investorName: row.investorName,
  };
}
