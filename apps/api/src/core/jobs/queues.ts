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
} as const satisfies Record<string, Queue>;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES]['name'];
