import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { AuditWriter } from '../../../core/audit/audit-writer.js';
import { currentUser } from '../../../core/context/request-context.js';
import {
  DATABASE,
  type Database,
  withCurrentTenant,
  withTenantTransaction,
} from '../../../core/database/database.js';
import { AppError } from '../../../core/errors/app-error.js';
import { JobQueue } from '../../../core/jobs/job-queue.js';
import { QUEUES } from '../../../core/jobs/queues.js';
import { Outbox } from '../../../core/outbox/outbox.js';
import { TenantDirectory } from '../../iam/index.js';
import { issuance, IssuancesService, issuanceTerms } from '../../issuance/index.js';
import type { InvariantBreach } from '../domain/ledger.js';
import { ledgerHead } from '../infrastructure/schema.js';
import { LedgerWriter } from './ledger-writer.js';
import { REGISTRY_EVENTS } from './subscription-event-types.js';

export interface ReconciliationResult {
  issuanceId: string;
  checkedAt: Date;
  entries: number;
  lastHash: string | null;
  breaches: InvariantBreach[];
}

/**
 * Daily job `registry-reconciliation` (SPEC §10.4, docs/ARCHITECTURE.md §4.9): rebuilds every
 * issuance's positions from its ledger and checks the hash chain. An anomaly is written in the
 * audit log and told to the Issuer Administrators and Compliance Officers; nothing is repaired
 * automatically (a correction goes through four eyes). The same check can be run on demand.
 */
@Injectable()
export class RegistryReconciliation implements OnApplicationBootstrap {
  private readonly logger = new Logger(RegistryReconciliation.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly jobs: JobQueue,
    private readonly tenants: TenantDirectory,
    private readonly issuances: IssuancesService,
    private readonly ledger: LedgerWriter,
    private readonly audit: AuditWriter,
    private readonly outbox: Outbox,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.jobs.work(QUEUES.registryReconciliation.name, () => this.run().then());
    await this.jobs.schedule(QUEUES.registryReconciliation.name, '15 3 * * *');
  }

  /** Every issuance of every active tenant; returns the issuances with anomalies. */
  async run(): Promise<ReconciliationResult[]> {
    const anomalies: ReconciliationResult[] = [];
    for (const { id: tenantId } of await this.tenants.activeTenants()) {
      await withTenantTransaction(this.db, tenantId, async (tx) => {
        const heads = await tx
          .select({
            issuanceId: ledgerHead.issuanceId,
            code: issuance.code,
            totalUnits: issuanceTerms.totalUnits,
            entries: ledgerHead.lastSequence,
            lastHash: ledgerHead.lastHash,
          })
          .from(ledgerHead)
          .innerJoin(issuance, eq(issuance.id, ledgerHead.issuanceId))
          .innerJoin(issuanceTerms, eq(issuanceTerms.issuanceId, ledgerHead.issuanceId));
        for (const head of heads) {
          const breaches = await this.ledger.breaches(tx, head.issuanceId, head.totalUnits);
          if (breaches.length === 0) continue;
          anomalies.push({ ...head, checkedAt: new Date(), breaches });
          this.logger.error(`Registry anomaly on issuance ${head.issuanceId}`);
          await this.audit.recordIn(tx, {
            tenantId,
            actorUserId: null,
            action: 'REGISTRY_RECONCILIATION_FAILED',
            resourceType: 'issuance',
            resourceId: head.issuanceId,
            newValue: { breaches },
            result: 'FAILED',
            reason: 'INVARIANT_BREACH',
          });
          await this.outbox.publish(tx, {
            tenantId,
            eventType: REGISTRY_EVENTS.anomaly,
            aggregateType: 'issuance',
            aggregateId: head.issuanceId,
            payload: { code: head.code, issuanceId: head.issuanceId },
          });
        }
      });
    }
    return anomalies;
  }

  /** The same check for one issuance, on demand (docs/API.md §2.8). */
  check(issuanceId: string): Promise<ReconciliationResult> {
    return withCurrentTenant(this.db, async (tx) => {
      // The issuer's staff only: an investor never sees the whole registry.
      if (currentUser().permissions.get('registry:read') === 'own')
        throw new AppError('RESOURCE_NOT_FOUND');
      const detail = await this.issuances.find(tx, issuanceId);
      const [head] = await tx
        .select()
        .from(ledgerHead)
        .where(eq(ledgerHead.issuanceId, issuanceId));
      return {
        issuanceId,
        checkedAt: new Date(),
        entries: head?.lastSequence ?? 0,
        lastHash: head?.lastHash ?? null,
        breaches: await this.ledger.breaches(tx, issuanceId, detail.terms.totalUnits),
      };
    });
  }
}
