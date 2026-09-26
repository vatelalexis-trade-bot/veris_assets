import { Inject, Injectable } from '@nestjs/common';
import {
  followingBusinessDay,
  subtractBusinessDays,
  type BusinessDate,
  type BusinessDayConvention,
  type DistributionFrequency,
} from '@virtus/shared';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { AuditWriter } from '../../../core/audit/audit-writer.js';
import {
  DATABASE,
  type Database,
  type Transaction,
  withCurrentTenant,
} from '../../../core/database/database.js';
import { AppError } from '../../../core/errors/app-error.js';
import { TenantDirectory } from '../../iam/index.js';
import { IssuancesService, type IssuanceDetail } from '../../issuance/index.js';
import { SubscriptionsService } from '../../registry/index.js';
import { generateSchedule } from '../domain/schedule.js';
import { couponSchedule, distribution } from '../infrastructure/schema.js';

export type ScheduleRow = typeof couponSchedule.$inferSelect & {
  distributionStatus: string | null;
};

/**
 * Activation of an issuance and its coupon schedule (SPEC §7.1, §12.1, D-009, D-012): once every
 * allocated subscription is paid, the issuance becomes ACTIVE and its coupons and principal are
 * scheduled, in one transaction.
 */
@Injectable()
export class SchedulesService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly issuances: IssuancesService,
    private readonly subscriptions: SubscriptionsService,
    private readonly audit: AuditWriter,
    private readonly tenants: TenantDirectory,
  ) {}

  activate(issuanceId: string): Promise<IssuanceDetail> {
    return withCurrentTenant(this.db, async (tx, tenantId) => {
      const detail = await this.issuances.find(tx, issuanceId, true);
      if (detail.issuance.status !== 'ALLOCATED') throw new AppError('INVALID_STATE_TRANSITION');
      const pending = await this.subscriptions.pendingPaymentCount(tx, issuanceId);
      if (pending > 0) {
        throw new AppError('PENDING_PAYMENTS_REMAINING', [
          { code: 'PENDING_PAYMENTS_REMAINING', field: null, meta: { count: pending } },
        ]);
      }
      const { terms } = detail;
      const schedule = generateSchedule({
        issueDate: terms.issueDate!,
        maturityDate: terms.maturityDate!,
        frequency: terms.distributionFrequency as DistributionFrequency,
        businessDayConvention: terms.businessDayConvention as BusinessDayConvention,
        recordDateOffsetBusinessDays: terms.recordDateOffsetBusinessDays,
      });
      await tx
        .insert(couponSchedule)
        .values(schedule.map((row) => ({ ...row, tenantId, issuanceId })));
      const activated = await this.issuances.markActive(tx, tenantId, issuanceId);
      await this.audit.recordIn(tx, {
        tenantId,
        action: 'COUPON_SCHEDULE_GENERATED',
        resourceType: 'issuance',
        resourceId: issuanceId,
        newValue: {
          payments: schedule.length,
          firstPaymentDate: schedule[0]?.paymentDate ?? null,
          maturityDate: terms.maturityDate,
        },
        result: 'SUCCESS',
      });
      return activated;
    });
  }

  /**
   * Total early redemption (SPEC §12.6), decided manually: the coupons and the principal not yet
   * paid on or after the date are cancelled, and the principal is scheduled on that date. The
   * coupons due before it are distributed first; no accrued interest is paid (D-085).
   */
  earlyRedemption(issuanceId: string, date: BusinessDate): Promise<ScheduleRow[]> {
    return withCurrentTenant(this.db, async (tx, tenantId) => {
      const detail = await this.issuances.find(tx, issuanceId, true);
      if (detail.issuance.status !== 'ACTIVE') throw new AppError('INVALID_STATE_TRANSITION');
      const today = await this.tenants.todayOf(tx, tenantId);
      if (date < today || date >= detail.terms.maturityDate!) {
        throw new AppError('VALIDATION_FAILED', [
          {
            code: 'EARLY_REDEMPTION_DATE_INVALID',
            field: 'paymentDate',
            meta: { today, maturityDate: detail.terms.maturityDate! },
          },
        ]);
      }
      const rows = await this.rows(tx, issuanceId);
      const replaced = rows.filter((row) => row.status === 'SCHEDULED' && row.paymentDate >= date);
      if (replaced.some((row) => row.distributionId !== null)) {
        throw new AppError('INVALID_STATE_TRANSITION', [
          { code: 'DISTRIBUTION_IN_PROGRESS', field: null },
        ]);
      }
      if (replaced.length > 0) {
        await tx
          .update(couponSchedule)
          .set({ status: 'CANCELLED' })
          .where(
            inArray(
              couponSchedule.id,
              replaced.map((row) => row.id),
            ),
          );
      }
      const { terms } = detail;
      const paymentDate =
        terms.businessDayConvention === 'FOLLOWING' ? followingBusinessDay(date) : date;
      await tx.insert(couponSchedule).values({
        tenantId,
        issuanceId,
        sequence: rows.reduce((last, row) => (row.sequence > last ? row.sequence : last), 0) + 1,
        type: 'PRINCIPAL',
        periodStart: terms.issueDate!,
        periodEnd: date,
        paymentDate,
        recordDate: subtractBusinessDays(paymentDate, terms.recordDateOffsetBusinessDays),
      });
      await this.audit.recordIn(tx, {
        tenantId,
        action: 'ISSUANCE_EARLY_REDEMPTION_SCHEDULED',
        resourceType: 'issuance',
        resourceId: issuanceId,
        newValue: { paymentDate, cancelledPayments: replaced.length },
        result: 'SUCCESS',
      });
      return this.rows(tx, issuanceId);
    });
  }

  /** Scheduled payments of an issuance, with the status of their distribution. */
  list(issuanceId: string): Promise<ScheduleRow[]> {
    return withCurrentTenant(this.db, async (tx) => {
      await this.issuances.find(tx, issuanceId);
      return this.rows(tx, issuanceId);
    });
  }

  async rows(tx: Transaction, issuanceId: string): Promise<ScheduleRow[]> {
    const rows = await tx
      .select({ schedule: couponSchedule, distributionStatus: distribution.status })
      .from(couponSchedule)
      .leftJoin(
        distribution,
        and(
          eq(distribution.couponScheduleId, couponSchedule.id),
          // The distribution in progress or done, not the cancelled ones.
          eq(distribution.id, couponSchedule.distributionId),
        ),
      )
      .where(eq(couponSchedule.issuanceId, issuanceId))
      .orderBy(asc(couponSchedule.sequence));
    return rows.map((row) => ({ ...row.schedule, distributionStatus: row.distributionStatus }));
  }
}
