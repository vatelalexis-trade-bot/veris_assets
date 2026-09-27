import type { Queue } from 'pg-boss';

/** Schema of the job queue, owned by va_jobs (decision D-039). */
export const JOB_SCHEMA = 'pgboss';

/**
 * Job queues (docs/ARCHITECTURE.md §4.9). They are created by `pnpm db:setup` (see
 * scripts/db/admin.ts), never by the running API. Not partitioned: creating them adds no table.
 */
export const QUEUES = {
  /** One outbox event to deliver; sent in the business transaction that wrote the event. */
  outboxEvent: {
    name: 'outbox-event',
    retryLimit: 8,
    retryDelay: 5,
    retryBackoff: true,
    notify: true,
  },
  /** Every minute: re-sends the outbox events that are still waiting (safety net). */
  outboxSweep: { name: 'outbox-sweep', retryLimit: 0 },
  /** One notification email; retried on its own so an SMTP outage never blocks other events. */
  notificationEmail: {
    name: 'notification-email',
    retryLimit: 8,
    retryDelay: 10,
    retryBackoff: true,
    notify: true,
  },
  /** Daily: deletes the expired idempotency keys. */
  idempotencyCleanup: { name: 'idempotency-cleanup', retryLimit: 2 },
  /** Daily: expires the KYC/KYB approvals past their date and warns 30 days before (SPEC §8.2). */
  kycExpiry: { name: 'kyc-expiry', retryLimit: 2 },
  /** Daily: checks the registry invariants 1, 2, 3 and 5 of every issuance (SPEC §10.4). */
  registryReconciliation: { name: 'registry-reconciliation', retryLimit: 2 },
  /** Daily and at start-up: closes the subscriptions past their end date (SPEC §7.1). */
  subscriptionAutoClose: { name: 'subscription-auto-close', retryLimit: 2 },
  /** One CSV export asked for by a user (P15-3); retried twice, then marked FAILED. */
  exportGeneration: { name: 'export-generation', retryLimit: 2, retryDelay: 10, notify: true },
  /** Nightly, online only: backup of the database copied to the storage (P16-4, D-106). */
  databaseBackup: { name: 'database-backup', retryLimit: 1, retryDelay: 600 },
} as const satisfies Record<string, Queue>;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES]['name'];
