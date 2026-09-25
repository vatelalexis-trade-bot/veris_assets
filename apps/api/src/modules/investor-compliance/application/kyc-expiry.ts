import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { dateInTimeZone } from '@virtus/shared';
import { and, eq, isNotNull } from 'drizzle-orm';
import { AuditWriter } from '../../../core/audit/audit-writer.js';
import { DATABASE, type Database, withTenantTransaction } from '../../../core/database/database.js';
import { JobQueue } from '../../../core/jobs/job-queue.js';
import { QUEUES } from '../../../core/jobs/queues.js';
import { Outbox } from '../../../core/outbox/outbox.js';
import { Workflow } from '../../../core/workflow/workflow.js';
import { TenantDirectory } from '../../iam/index.js';
import { kycCaseMachine, kycExpiryAction } from '../domain/kyc.js';
import { investor, kycCase } from '../infrastructure/schema.js';
import { INVESTOR_EVENTS } from './investor-events.js';

export interface KycExpiryReport {
  expired: number;
  warned: number;
}

/**
 * Daily job `kyc-expiry` (SPEC §8.2, docs/ARCHITECTURE.md §4.9): expires the approved cases past
 * their last valid day, and warns 30 days before. Works tenant by tenant, with "today" in the
 * tenant's time zone (D-015). An expired investor keeps its positions.
 */
@Injectable()
export class KycExpiry implements OnApplicationBootstrap {
  private readonly logger = new Logger(KycExpiry.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly jobs: JobQueue,
    private readonly tenants: TenantDirectory,
    private readonly workflow: Workflow,
    private readonly audit: AuditWriter,
    private readonly outbox: Outbox,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.jobs.work(QUEUES.kycExpiry.name, () => this.run().then());
    await this.jobs.schedule(QUEUES.kycExpiry.name, '30 2 * * *');
  }

  async run(now = new Date()): Promise<KycExpiryReport> {
    const report: KycExpiryReport = { expired: 0, warned: 0 };
    for (const { id: tenantId, timezone } of await this.tenants.activeTenants()) {
      const today = dateInTimeZone(now, timezone);
      await withTenantTransaction(this.db, tenantId, async (tx) => {
        const approved = await tx
          .select()
          .from(kycCase)
          .where(and(eq(kycCase.status, 'APPROVED'), isNotNull(kycCase.validUntil)))
          .for('update', { skipLocked: true });
        for (const found of approved) {
          const action = kycExpiryAction(
            found.validUntil!,
            today,
            found.expiryWarningSentAt !== null,
          );
          if (action === 'EXPIRE') {
            await this.workflow.transition(tx, kycCaseMachine, {
              tenantId,
              resourceId: found.id,
              from: 'APPROVED',
              to: 'EXPIRED',
            });
            await tx
              .update(kycCase)
              .set({ status: 'EXPIRED', updatedAt: new Date() })
              .where(eq(kycCase.id, found.id));
            await tx
              .update(investor)
              .set({ kycStatus: 'EXPIRED', updatedAt: new Date() })
              .where(eq(investor.id, found.investorId));
            await this.audit.recordIn(tx, {
              tenantId,
              action: 'KYC_EXPIRED',
              resourceType: 'kyc_case',
              resourceId: found.id,
              oldValue: { status: 'APPROVED' },
              newValue: { status: 'EXPIRED', validUntil: found.validUntil },
              result: 'SUCCESS',
            });
            await this.outbox.publish(tx, {
              tenantId,
              eventType: INVESTOR_EVENTS.kycExpired,
              aggregateType: 'kyc_case',
              aggregateId: found.id,
              payload: { investorId: found.investorId },
            });
            report.expired += 1;
          } else if (action === 'WARN') {
            await tx
              .update(kycCase)
              .set({ expiryWarningSentAt: new Date() })
              .where(eq(kycCase.id, found.id));
            await this.outbox.publish(tx, {
              tenantId,
              eventType: INVESTOR_EVENTS.kycExpiring,
              aggregateType: 'kyc_case',
              aggregateId: found.id,
              payload: { investorId: found.investorId, validUntil: found.validUntil },
            });
            report.warned += 1;
          }
        }
      });
    }
    this.logger.log(report, 'KYC expiry done');
    return report;
  }
}
