import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { and, eq, inArray, lt } from 'drizzle-orm';
import { AuditWriter } from '../../../core/audit/audit-writer.js';
import { DATABASE, type Database, withTenantTransaction } from '../../../core/database/database.js';
import { JobQueue } from '../../../core/jobs/job-queue.js';
import { QUEUES } from '../../../core/jobs/queues.js';
import { Workflow } from '../../../core/workflow/workflow.js';
import { TenantDirectory } from '../../iam/index.js';
import { issuanceMachine } from '../domain/issuance-machine.js';
import { issuance, issuanceTerms } from '../infrastructure/schema.js';

/**
 * Job `subscription-auto-close` (SPEC §7.1, docs/ARCHITECTURE.md §4.9): closes the subscriptions
 * whose end date has passed, in each tenant's time zone. Daily, and once when the workers start.
 */
@Injectable()
export class SubscriptionAutoClose implements OnApplicationBootstrap {
  private readonly logger = new Logger(SubscriptionAutoClose.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly jobs: JobQueue,
    private readonly tenants: TenantDirectory,
    private readonly workflow: Workflow,
    private readonly audit: AuditWriter,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.jobs.work(QUEUES.subscriptionAutoClose.name, () => this.run().then());
    await this.jobs.schedule(QUEUES.subscriptionAutoClose.name, '5 0 * * *');
    if (this.jobs.workersEnabled) await this.jobs.send(QUEUES.subscriptionAutoClose.name, {});
  }

  async run(now = new Date()): Promise<number> {
    let closed = 0;
    for (const { id: tenantId } of await this.tenants.activeTenants()) {
      closed += await withTenantTransaction(this.db, tenantId, async (tx) => {
        const today = await this.tenants.todayOf(tx, tenantId, now);
        // The issuance rows alone are locked (PostgreSQL refuses "FOR UPDATE OF schema.table").
        const due = await tx
          .select({ id: issuance.id })
          .from(issuance)
          .where(
            and(
              eq(issuance.status, 'SUBSCRIPTION_OPEN'),
              inArray(
                issuance.id,
                tx
                  .select({ id: issuanceTerms.issuanceId })
                  .from(issuanceTerms)
                  .where(lt(issuanceTerms.subscriptionEndDate, today)),
              ),
            ),
          )
          .for('update', { skipLocked: true });
        for (const { id } of due) {
          await this.workflow.transition(tx, issuanceMachine, {
            tenantId,
            resourceId: id,
            from: 'SUBSCRIPTION_OPEN',
            to: 'SUBSCRIPTION_CLOSED',
          });
          await tx
            .update(issuance)
            .set({ status: 'SUBSCRIPTION_CLOSED', updatedAt: new Date() })
            .where(eq(issuance.id, id));
          await this.audit.recordIn(tx, {
            tenantId,
            action: 'ISSUANCE_SUBSCRIPTION_CLOSED',
            resourceType: 'issuance',
            resourceId: id,
            oldValue: { status: 'SUBSCRIPTION_OPEN' },
            newValue: { status: 'SUBSCRIPTION_CLOSED' },
            result: 'SUCCESS',
            reason: 'END_DATE_PASSED',
          });
        }
        return due.length;
      });
    }
    this.logger.log({ closed }, 'Subscription auto-close done');
    return closed;
  }
}
