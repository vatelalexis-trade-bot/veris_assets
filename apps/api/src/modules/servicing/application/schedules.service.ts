import { Inject, Injectable } from '@nestjs/common';
import type { BusinessDayConvention, DistributionFrequency } from '@virtus/shared';
import { and, asc, eq } from 'drizzle-orm';
import { AuditWriter } from '../../../core/audit/audit-writer.js';
import {
  DATABASE,
  type Database,
  type Transaction,
  withCurrentTenant,
} from '../../../core/database/database.js';
import { AppError } from '../../../core/errors/app-error.js';
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
