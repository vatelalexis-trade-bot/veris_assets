import { Inject, Injectable } from '@nestjs/common';
import {
  CURRENCY_MINOR_UNITS,
  isCurrencyCode,
  parseDecimal,
  type DayCount,
  type RoundingMethod,
} from '@virtus/shared';
import { and, asc, count, desc, eq, exists, lte, sql, type SQL } from 'drizzle-orm';
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
import { CircuitBreaker } from '../../../core/providers/circuit-breaker.js';
import {
  PAYMENT_PROVIDER,
  type PaymentProvider,
} from '../../../core/providers/payment-provider.js';
import { Workflow } from '../../../core/workflow/workflow.js';
import { TenantDirectory, UserDirectory } from '../../iam/index.js';
import { issuance, IssuancesService, type IssuanceDetail } from '../../issuance/index.js';
import { RegistryQueries, RegistryRedemptions, RegistrySnapshots } from '../../registry/index.js';
import { periodFraction } from '../domain/day-count.js';
import {
  calculateDistribution,
  distributionMachine,
  paymentInstructionCsv,
  type Calculation,
  type DistributionStatus,
} from '../domain/distribution.js';
import {
  couponSchedule,
  distribution,
  distributionLine,
  paymentInstruction,
} from '../infrastructure/schema.js';
import { DISTRIBUTION_EVENTS } from './distribution-events.js';

/** Version of the calculation rules, kept with every distribution. */
export const CALCULATION_VERSION = 'servicing-calc-1';

type DistributionRow = typeof distribution.$inferSelect;
type ScheduleRow = typeof couponSchedule.$inferSelect;
export type InstructionRow = typeof paymentInstruction.$inferSelect;
export type LineRow = typeof distributionLine.$inferSelect & { investorName: string | null };

export interface DistributionDetail {
  distribution: DistributionRow;
  schedule: ScheduleRow;
  issuanceName: string;
  issuanceCode: string;
  instruction: InstructionRow | null;
}

export interface RecalculationCheck {
  snapshotReproducible: boolean;
  identical: boolean;
  totalGrossAmount: string | null;
  differences: { accountId: string; stored: string | null; recalculated: string | null }[];
}

/**
 * Distributions (SPEC §12): created from a scheduled payment; calculated on a snapshot of the
 * registry at the record date; submitted, then approved by another Issuer Administrator (four
 * eyes); paid through a fictitious payment instruction, prepared then confirmed with four eyes.
 * A distribution can be calculated again from its snapshot to prove the result is reproducible.
 */
@Injectable()
export class DistributionsService {
  private readonly provider = new CircuitBreaker();

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(PAYMENT_PROVIDER) private readonly payments: PaymentProvider,
    private readonly issuances: IssuancesService,
    private readonly snapshots: RegistrySnapshots,
    private readonly redemptions: RegistryRedemptions,
    private readonly registry: RegistryQueries,
    private readonly tenants: TenantDirectory,
    private readonly workflow: Workflow,
    private readonly audit: AuditWriter,
    private readonly outbox: Outbox,
    private readonly users: UserDirectory,
  ) {}

  /** An investor sees the distributions it has a line in, and only its own line. */
  private ownInvestor(user: RequestUser): string | null | undefined {
    if (user.permissions.get('distribution:read') !== 'own') return undefined;
    return user.investorId;
  }

  private scopeOf(user: RequestUser): SQL | undefined {
    const own = this.ownInvestor(user);
    if (own === undefined) return undefined;
    if (!own) return sql`false`;
    return exists(
      this.db
        .select({ id: distributionLine.id })
        .from(distributionLine)
        .where(
          and(
            eq(distributionLine.distributionId, distribution.id),
            eq(distributionLine.calculationNo, distribution.calculationNo),
            eq(distributionLine.investorId, own),
          ),
        ),
    );
  }

  async list(
    filters: { issuanceId?: string; status?: DistributionStatus },
    pagination: Pagination,
  ): Promise<Page<DistributionDetail>> {
    const conditions = [
      this.scopeOf(currentUser()),
      filters.issuanceId ? eq(distribution.issuanceId, filters.issuanceId) : undefined,
      filters.status ? eq(distribution.status, filters.status) : undefined,
    ].filter((condition): condition is SQL => condition !== undefined);
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    return withCurrentTenant(this.db, async (tx) => {
      const [{ total } = { total: 0 }] = await tx
        .select({ total: count() })
        .from(distribution)
        .where(where);
      const rows = await this.detailQuery(tx)
        .where(where)
        .orderBy(desc(couponSchedule.paymentDate), desc(distribution.createdAt))
        .limit(pagination.pageSize)
        .offset(offsetOf(pagination));
      return { data: rows.map(flatten), meta: { ...pagination, total } };
    });
  }

  get(id: string): Promise<DistributionDetail> {
    return withCurrentTenant(this.db, (tx) => this.find(tx, id));
  }

  /** Lines of the current calculation, with the investors' names (only its own for an investor). */
  lines(id: string): Promise<LineRow[]> {
    return withCurrentTenant(this.db, async (tx) => {
      const found = await this.find(tx, id);
      return this.currentLines(tx, found.distribution, this.ownInvestor(currentUser()));
    });
  }

  /** A draft distribution of a scheduled payment of an active issuance. */
  create(couponScheduleId: string): Promise<DistributionDetail> {
    return withCurrentTenant(this.db, async (tx, tenantId) => {
      const [peek] = await tx
        .select()
        .from(couponSchedule)
        .where(eq(couponSchedule.id, couponScheduleId));
      if (!peek) throw new AppError('RESOURCE_NOT_FOUND');
      const detail = await this.issuances.find(tx, peek.issuanceId, true);
      const [schedule] = await tx
        .select()
        .from(couponSchedule)
        .where(eq(couponSchedule.id, couponScheduleId))
        .for('update');
      if (detail.issuance.status !== 'ACTIVE' || schedule!.status !== 'SCHEDULED')
        throw new AppError('INVALID_STATE_TRANSITION');
      if (schedule!.distributionId) throw new AppError('DISTRIBUTION_ALREADY_EXISTS');
      // The principal comes last: every coupon due before it must have been distributed.
      if (schedule!.type === 'PRINCIPAL') await this.requireCouponsDistributed(tx, schedule!);
      const userId = currentUser().userId;
      const [created] = await tx
        .insert(distribution)
        .values({
          tenantId,
          issuanceId: schedule!.issuanceId,
          couponScheduleId,
          type: schedule!.type,
          currency: detail.issuance.currency!,
          createdBy: userId,
        })
        .returning();
      await tx
        .update(couponSchedule)
        .set({ distributionId: created!.id })
        .where(eq(couponSchedule.id, couponScheduleId));
      await this.workflow.start(tx, distributionMachine, {
        tenantId,
        resourceId: created!.id,
        to: 'DRAFT',
      });
      await this.audit.recordIn(tx, {
        tenantId,
        action: 'DISTRIBUTION_CREATED',
        resourceType: 'distribution',
        resourceId: created!.id,
        newValue: { couponScheduleId, paymentDate: schedule!.paymentDate, type: schedule!.type },
        result: 'SUCCESS',
      });
      return this.find(tx, created!.id);
    });
  }

  /**
   * Snapshot of the registry at the record date, then one line per holder (SPEC §12.2, §12.3).
   * Not before the record date: the holders are only known then.
   */
  calculate(id: string): Promise<DistributionDetail> {
    return this.transition(id, 'CALCULATED', null, async (tx, tenantId, found, detail) => {
      const today = await this.tenants.todayOf(tx, tenantId);
      if (today < found.schedule.recordDate) {
        throw new AppError('INVALID_STATE_TRANSITION', [
          {
            code: 'RECORD_DATE_NOT_REACHED',
            field: null,
            meta: { recordDate: found.schedule.recordDate },
          },
        ]);
      }
      const snapshot = await this.snapshots.take(
        tx,
        tenantId,
        found.distribution.issuanceId,
        found.schedule.recordDate,
      );
      const inputs = this.inputsOf(found, detail);
      const result = calculateDistribution({
        ...inputs,
        holders: snapshot.lines.map((line) => ({
          accountId: line.accountId,
          investorId: line.investorId,
          quantity: line.quantityHeld,
        })),
      });
      const calculationNo = found.distribution.calculationNo + 1;
      if (result.lines.length > 0) {
        await tx.insert(distributionLine).values(
          result.lines.map((line) => ({
            tenantId,
            distributionId: id,
            calculationNo,
            investorId: line.investorId,
            accountId: line.accountId,
            eligibleQuantity: line.quantity,
            grossAmountUnrounded: line.grossAmountUnrounded,
            grossAmount: line.grossAmount,
            currency: found.distribution.currency,
            anomalyCode: line.anomalyCode,
          })),
        );
      }
      await tx
        .update(distribution)
        .set({
          snapshotId: snapshot.id,
          calculationNo,
          dayCount: inputs.dayCount,
          periodFraction: inputs.fraction.toString(),
          rate: inputs.rate,
          nominalValue: inputs.nominalValue,
          roundingMethod: inputs.roundingMethod,
          totalGrossAmount: result.totalGross,
          totalUnroundedAmount: result.totalUnrounded,
          roundingDifference: result.roundingDifference,
          beneficiaryCount: result.beneficiaryCount,
          calculationVersion: CALCULATION_VERSION,
          calculatedAt: new Date(),
        })
        .where(eq(distribution.id, id));
      return { event: null };
    });
  }

  submit(id: string): Promise<DistributionDetail> {
    return this.transition(id, 'UNDER_REVIEW', null, async (tx) => {
      await tx
        .update(distribution)
        .set({ preparedBy: currentUser().userId })
        .where(eq(distribution.id, id));
      return { event: DISTRIBUTION_EVENTS.submitted, extra: { preparedBy: currentUser().userId } };
    });
  }

  /** Four eyes: another Issuer Administrator than the one who submitted it (SPEC §4.8). */
  approve(id: string): Promise<DistributionDetail> {
    return this.transition(id, 'APPROVED', null, async (tx) => {
      await tx
        .update(distribution)
        .set({ approvedBy: currentUser().userId, approvedAt: new Date() })
        .where(eq(distribution.id, id));
      return { event: null };
    });
  }

  /** Sent back to be calculated again (e.g. after a correction of the registry); comment required. */
  returnToDraft(id: string, comment: string): Promise<DistributionDetail> {
    return this.transition(id, 'DRAFT', comment, async (tx) => {
      await tx
        .update(distribution)
        .set({ statusComment: comment.trim() })
        .where(eq(distribution.id, id));
      return { event: null };
    });
  }

  /** Cancelled with a reason; the scheduled payment can be distributed again. */
  cancel(id: string, comment: string): Promise<DistributionDetail> {
    return this.transition(id, 'CANCELLED', comment, async (tx, _tenantId, found) => {
      await tx
        .update(distribution)
        .set({ statusComment: comment.trim() })
        .where(eq(distribution.id, id));
      await tx
        .update(couponSchedule)
        .set({ distributionId: null })
        .where(eq(couponSchedule.id, found.schedule.id));
      return { event: null };
    });
  }

  /**
   * Control recalculation (SPEC §12.3): the snapshot is rebuilt from the ledger and the lines
   * are calculated again from it; nothing is written.
   */
  recalculationCheck(id: string): Promise<RecalculationCheck> {
    return withCurrentTenant(this.db, async (tx) => {
      const found = await this.find(tx, id);
      const row = found.distribution;
      if (!row.snapshotId) throw new AppError('INVALID_STATE_TRANSITION');
      const snapshot = await this.snapshots.read(tx, row.snapshotId);
      const result = calculateDistribution({
        type: row.type as 'COUPON' | 'PRINCIPAL',
        nominalValue: row.nominalValue!,
        rate: row.rate!,
        fraction: parseDecimal(row.periodFraction!),
        roundingMethod: row.roundingMethod as RoundingMethod,
        minorUnits: minorUnitsOf(row.currency),
        holders: snapshot.lines.map((line) => ({
          accountId: line.accountId,
          investorId: line.investorId,
          quantity: line.quantityHeld,
        })),
      });
      const stored = await this.currentLines(tx, row, undefined);
      const differences = diff(stored, result);
      const totalsEqual = parseDecimal(result.totalGross).eq(parseDecimal(row.totalGrossAmount!));
      return {
        snapshotReproducible: await this.snapshots.verify(tx, row.snapshotId),
        identical: differences.length === 0 && totalsEqual,
        totalGrossAmount: result.totalGross,
        differences,
      };
    });
  }

  /** The fictitious payment instruction (SPEC §12.5), again after a failure. */
  generateInstruction(id: string): Promise<DistributionDetail> {
    return this.transition(
      id,
      'PAYMENT_INSTRUCTION_GENERATED',
      null,
      async (tx, tenantId, found) => {
        const row = found.distribution;
        const values = {
          status: 'GENERATED',
          totalAmount: row.totalGrossAmount!,
          currency: row.currency,
          lineCount: row.beneficiaryCount ?? 0,
          generatedAt: new Date(),
          preparedBy: null,
          preparedAt: null,
          confirmedBy: null,
          confirmedAt: null,
          providerReference: null,
          updatedAt: new Date(),
        };
        if (found.instruction) {
          await tx
            .update(paymentInstruction)
            .set(values)
            .where(eq(paymentInstruction.id, found.instruction.id));
        } else {
          await tx
            .insert(paymentInstruction)
            .values({ ...values, tenantId, distributionId: id, createdBy: currentUser().userId });
        }
        return { event: null };
      },
    );
  }

  /** The issuer's staff tell the (fictitious) bank what to pay. */
  prepareInstruction(id: string): Promise<DistributionDetail> {
    return withCurrentTenant(this.db, async (tx, tenantId) => {
      const found = await this.lockWithIssuance(tx, id);
      const instruction = found.instruction;
      if (
        found.distribution.status !== 'PAYMENT_INSTRUCTION_GENERATED' ||
        instruction?.status !== 'GENERATED'
      )
        throw new AppError('INVALID_STATE_TRANSITION');
      const { reference } = await this.provider.call(() =>
        this.payments.prepare({
          paymentId: instruction.id,
          amount: instruction.totalAmount,
          currency: instruction.currency,
        }),
      );
      const userId = currentUser().userId;
      await tx
        .update(paymentInstruction)
        .set({
          status: 'PREPARED',
          preparedBy: userId,
          preparedAt: new Date(),
          providerReference: reference,
          updatedAt: new Date(),
        })
        .where(eq(paymentInstruction.id, instruction.id));
      await this.audit.recordIn(tx, {
        tenantId,
        action: 'DISTRIBUTION_PAYMENT_PREPARED',
        resourceType: 'distribution',
        resourceId: id,
        newValue: { totalAmount: instruction.totalAmount, providerReference: reference },
        result: 'SUCCESS',
      });
      await this.publish(tx, tenantId, DISTRIBUTION_EVENTS.paymentPrepared, found, {
        preparedBy: userId,
      });
      return this.find(tx, id);
    });
  }

  /**
   * Four eyes: another administrator confirms. Received → PAID and the scheduled payment is
   * distributed; not received → FAILED (kept), and a new instruction can be generated.
   */
  confirmInstruction(id: string): Promise<DistributionDetail> {
    return withCurrentTenant(this.db, async (tx, tenantId) => {
      const found = await this.lockWithIssuance(tx, id);
      const instruction = found.instruction;
      if (
        found.distribution.status !== 'PAYMENT_INSTRUCTION_GENERATED' ||
        instruction?.status !== 'PREPARED'
      )
        throw new AppError('INVALID_STATE_TRANSITION');
      // The four-eyes rule is checked before asking the provider.
      await this.workflow.transition(tx, distributionMachine, {
        tenantId,
        resourceId: id,
        from: 'PAYMENT_INSTRUCTION_GENERATED',
        to: 'PAID',
        initiatorUserId: instruction.preparedBy,
      });
      // A repayment of the principal must be possible before anything is paid.
      if (found.distribution.type === 'PRINCIPAL') {
        const snapshot = await this.snapshots.read(tx, found.distribution.snapshotId!);
        await this.redemptions.check(tx, tenantId, found.distribution.issuanceId, snapshot.lines);
      }
      const { received } = await this.provider.call(() =>
        this.payments.confirm(instruction.providerReference!),
      );
      // Not received: this transaction (and its PAID transition) is undone, FAILED is kept apart.
      if (!received) throw new PaymentNotReceived();
      await this.settle(tx, tenantId, found);
      return this.find(tx, id);
    }).catch(async (error: unknown) => {
      if (!(error instanceof PaymentNotReceived)) throw error;
      return this.fail(id);
    });
  }

  /** CSV of the payment instruction (SPEC §12.5), with the demonstration mention. */
  csv(id: string): Promise<{ fileName: string; content: string }> {
    return withCurrentTenant(this.db, async (tx) => {
      const found = await this.find(tx, id);
      if (!found.instruction) throw new AppError('RESOURCE_NOT_FOUND');
      const lines = await this.currentLines(tx, found.distribution, undefined);
      return {
        fileName: `payment-instruction-${found.issuanceCode}-${found.schedule.paymentDate}.csv`,
        content: paymentInstructionCsv({
          issuanceCode: found.issuanceCode,
          paymentDate: found.schedule.paymentDate,
          currency: found.distribution.currency,
          lines: lines.map((line) => ({
            investorId: line.investorId,
            investorName: line.investorName ?? '',
            grossAmount: parseDecimal(line.grossAmount).toFixed(minorUnitsOf(line.currency)),
          })),
        }),
      };
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
            eq(workflowTransition.resourceType, 'distribution'),
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

  /** PAID: the instruction is confirmed and the scheduled payment distributed. */
  private async settle(
    tx: Transaction,
    tenantId: string,
    found: DistributionDetail,
  ): Promise<void> {
    const id = found.distribution.id;
    const to: DistributionStatus = 'PAID';
    await tx
      .update(paymentInstruction)
      .set({
        status: 'CONFIRMED',
        confirmedBy: currentUser().userId,
        confirmedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(paymentInstruction.id, found.instruction!.id));
    await tx
      .update(couponSchedule)
      .set({ status: 'DISTRIBUTED' })
      .where(eq(couponSchedule.id, found.schedule.id));
    await tx
      .update(distribution)
      .set({ status: to, version: sql`${distribution.version} + 1`, updatedAt: new Date() })
      .where(eq(distribution.id, id));
    await this.audit.recordIn(tx, {
      tenantId,
      action: 'DISTRIBUTION_PAID',
      resourceType: 'distribution',
      resourceId: id,
      oldValue: { status: 'PAYMENT_INSTRUCTION_GENERATED' },
      newValue: { status: to, totalGrossAmount: found.distribution.totalGrossAmount },
      result: 'SUCCESS',
    });
    await this.publish(tx, tenantId, DISTRIBUTION_EVENTS.paid, found);
    if (found.distribution.type === 'PRINCIPAL') await this.repay(tx, tenantId, found);
  }

  /**
   * The principal is paid (SPEC §12.6): REDEMPTION of every position, then the issuance is
   * MATURED — at maturity or after a total early redemption.
   */
  private async repay(tx: Transaction, tenantId: string, found: DistributionDetail): Promise<void> {
    const issuanceId = found.distribution.issuanceId;
    const detail = await this.issuances.find(tx, issuanceId, true);
    const snapshot = await this.snapshots.read(tx, found.distribution.snapshotId!);
    await this.redemptions.redeemAll(
      tx,
      tenantId,
      issuanceId,
      snapshot.lines,
      detail.terms.totalUnits,
      `distribution:${found.distribution.id}`,
    );
    await this.issuances.markMatured(tx, tenantId, issuanceId);
  }

  private async requireCouponsDistributed(tx: Transaction, principal: ScheduleRow): Promise<void> {
    const [due] = await tx
      .select({ id: couponSchedule.id })
      .from(couponSchedule)
      .where(
        and(
          eq(couponSchedule.issuanceId, principal.issuanceId),
          eq(couponSchedule.type, 'COUPON'),
          eq(couponSchedule.status, 'SCHEDULED'),
          lte(couponSchedule.paymentDate, principal.paymentDate),
        ),
      );
    if (due) {
      throw new AppError('INVALID_STATE_TRANSITION', [
        { code: 'COUPONS_NOT_DISTRIBUTED', field: null },
      ]);
    }
  }

  /** The provider did not receive the payment: FAILED is kept, in its own transaction. */
  private fail(id: string): Promise<DistributionDetail> {
    return withCurrentTenant(this.db, async (tx, tenantId) => {
      const found = await this.lockDistribution(tx, id);
      await this.workflow.transition(tx, distributionMachine, {
        tenantId,
        resourceId: id,
        from: 'PAYMENT_INSTRUCTION_GENERATED',
        to: 'FAILED',
      });
      await tx
        .update(paymentInstruction)
        .set({ status: 'FAILED', updatedAt: new Date() })
        .where(eq(paymentInstruction.id, found.instruction!.id));
      await tx
        .update(distribution)
        .set({ status: 'FAILED', version: sql`${distribution.version} + 1`, updatedAt: new Date() })
        .where(eq(distribution.id, id));
      await this.audit.recordIn(tx, {
        tenantId,
        action: 'DISTRIBUTION_FAILED',
        resourceType: 'distribution',
        resourceId: id,
        oldValue: { status: 'PAYMENT_INSTRUCTION_GENERATED' },
        newValue: { status: 'FAILED' },
        result: 'FAILED',
        reason: 'PAYMENT_NOT_RECEIVED',
      });
      return this.find(tx, id);
    });
  }

  /**
   * One transition with the issuance locked first, the machine's check (four eyes against the
   * preparer), the use case, the audit and the event.
   */
  private transition(
    id: string,
    to: DistributionStatus,
    comment: string | null,
    apply: (
      tx: Transaction,
      tenantId: string,
      found: DistributionDetail,
      detail: IssuanceDetail,
    ) => Promise<{ event: string | null; extra?: Record<string, string> }>,
  ): Promise<DistributionDetail> {
    return withCurrentTenant(this.db, async (tx, tenantId) => {
      const peek = await this.find(tx, id);
      const detail = await this.issuances.find(tx, peek.distribution.issuanceId, true);
      const found = await this.lockDistribution(tx, id);
      const from = found.distribution.status as DistributionStatus;
      await this.workflow.transition(tx, distributionMachine, {
        tenantId,
        resourceId: id,
        from,
        to,
        comment,
        initiatorUserId: found.distribution.preparedBy,
      });
      const { event, extra } = await apply(tx, tenantId, found, detail);
      await tx
        .update(distribution)
        .set({ status: to, version: sql`${distribution.version} + 1`, updatedAt: new Date() })
        .where(eq(distribution.id, id));
      await this.audit.recordIn(tx, {
        tenantId,
        action: `DISTRIBUTION_${to}`,
        resourceType: 'distribution',
        resourceId: id,
        oldValue: { status: from },
        newValue: { status: to },
        result: 'SUCCESS',
        ...(comment ? { reason: 'COMMENTED' } : {}),
      });
      if (event) await this.publish(tx, tenantId, event, found, extra);
      return this.find(tx, id);
    });
  }

  private async publish(
    tx: Transaction,
    tenantId: string,
    eventType: string,
    found: DistributionDetail,
    extra: Record<string, string> = {},
  ): Promise<void> {
    await this.outbox.publish(tx, {
      tenantId,
      eventType,
      aggregateType: 'distribution',
      aggregateId: found.distribution.id,
      payload: { code: found.issuanceCode, issuanceId: found.distribution.issuanceId, ...extra },
    });
  }

  private inputsOf(found: DistributionDetail, detail: IssuanceDetail) {
    const dayCount = detail.terms.dayCount as DayCount;
    return {
      type: found.distribution.type as 'COUPON' | 'PRINCIPAL',
      dayCount,
      fraction: periodFraction(dayCount, found.schedule.periodStart, found.schedule.periodEnd),
      rate: detail.terms.interestRate!,
      nominalValue: detail.terms.nominalValue!,
      roundingMethod: detail.terms.roundingMethod as RoundingMethod,
      minorUnits: minorUnitsOf(found.distribution.currency),
    };
  }

  private async currentLines(
    tx: Transaction,
    row: DistributionRow,
    ownInvestor: string | null | undefined,
  ): Promise<LineRow[]> {
    const lines = await tx
      .select()
      .from(distributionLine)
      .where(
        and(
          eq(distributionLine.distributionId, row.id),
          eq(distributionLine.calculationNo, row.calculationNo),
          ownInvestor === undefined
            ? undefined
            : ownInvestor
              ? eq(distributionLine.investorId, ownInvestor)
              : sql`false`,
        ),
      )
      .orderBy(asc(distributionLine.accountId));
    const names = await this.registry.investorNames(
      tx,
      lines.map((line) => line.investorId),
    );
    return lines.map((line) => ({ ...line, investorName: names.get(line.investorId) ?? null }));
  }

  private detailQuery(tx: Transaction) {
    return tx
      .select({
        distribution,
        schedule: couponSchedule,
        issuanceName: issuance.name,
        issuanceCode: issuance.code,
        instruction: paymentInstruction,
      })
      .from(distribution)
      .innerJoin(couponSchedule, eq(couponSchedule.id, distribution.couponScheduleId))
      .innerJoin(issuance, eq(issuance.id, distribution.issuanceId))
      .leftJoin(paymentInstruction, eq(paymentInstruction.distributionId, distribution.id));
  }

  /** The issuance first, then the distribution: the same order as every other write. */
  private async lockWithIssuance(tx: Transaction, id: string): Promise<DistributionDetail> {
    const peek = await this.find(tx, id);
    await this.issuances.find(tx, peek.distribution.issuanceId, true);
    return this.lockDistribution(tx, id);
  }

  private async lockDistribution(tx: Transaction, id: string): Promise<DistributionDetail> {
    await this.find(tx, id);
    await tx
      .select({ id: distribution.id })
      .from(distribution)
      .where(eq(distribution.id, id))
      .for('update');
    return this.find(tx, id);
  }

  private async find(tx: Transaction, id: string): Promise<DistributionDetail> {
    const scope = this.scopeOf(currentUser());
    const [row] = await this.detailQuery(tx).where(
      scope ? and(eq(distribution.id, id), scope) : eq(distribution.id, id),
    );
    if (!row) throw new AppError('RESOURCE_NOT_FOUND');
    return flatten(row);
  }
}

class PaymentNotReceived extends Error {}

function flatten(row: {
  distribution: DistributionRow;
  schedule: ScheduleRow;
  issuanceName: string;
  issuanceCode: string;
  instruction: InstructionRow | null;
}): DistributionDetail {
  return row;
}

function minorUnitsOf(currency: string): number {
  return isCurrencyCode(currency) ? CURRENCY_MINOR_UNITS[currency] : 2;
}

function diff(stored: readonly LineRow[], result: Calculation): RecalculationCheck['differences'] {
  const recalculated = new Map(result.lines.map((line) => [line.accountId, line.grossAmount]));
  const differences: RecalculationCheck['differences'] = [];
  for (const line of stored) {
    const again = recalculated.get(line.accountId) ?? null;
    if (again === null || !parseDecimal(again).eq(parseDecimal(line.grossAmount)))
      differences.push({
        accountId: line.accountId,
        stored: line.grossAmount,
        recalculated: again,
      });
    recalculated.delete(line.accountId);
  }
  for (const [accountId, amount] of recalculated)
    differences.push({ accountId, stored: null, recalculated: amount });
  return differences;
}
