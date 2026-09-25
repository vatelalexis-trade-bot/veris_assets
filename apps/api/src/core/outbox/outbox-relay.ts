import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { and, asc, eq, isNull, lt, sql } from 'drizzle-orm';
import {
  DATABASE,
  type Database,
  type Transaction,
  withPlatformTransaction,
  withTenantTransaction,
} from '../database/database.js';
import { outboxEvent } from '../database/schema.js';
import { JobQueue } from '../jobs/job-queue.js';
import { QUEUES } from '../jobs/queues.js';
import {
  NotificationService,
  type NotificationRequest,
} from '../notifications/notification.service.js';
import type { OutboxJob } from './outbox.js';

export type OutboxEventRecord = typeof outboxEvent.$inferSelect;

/**
 * Reaction of a module to an event, in the delivery transaction: returns the notifications to
 * create. It must be safe to run twice (delivery is "at least once").
 */
export type OutboxHandler = (
  tx: Transaction,
  event: OutboxEventRecord,
) => Promise<readonly NotificationRequest[]>;

/** After this many failed deliveries, an event is left aside (and stays visible in the table). */
export const MAX_DELIVERY_ATTEMPTS = 10;
/** The safety net only picks events older than this: fresh ones are handled by their own job. */
const SWEEP_DELAY_SECONDS = 30;
const SWEEP_BATCH = 500;

/**
 * Worker `outbox-relay` (docs/ARCHITECTURE.md §4.9): delivers each event to the handlers of the
 * modules, creates the notifications, then marks the event processed, in one transaction.
 */
@Injectable()
export class OutboxRelay implements OnApplicationBootstrap {
  private readonly logger = new Logger(OutboxRelay.name);
  private readonly handlers = new Map<string, OutboxHandler[]>();

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly jobs: JobQueue,
    private readonly notifications: NotificationService,
  ) {}

  /** Registers the reaction of a module to an event type (called when the module starts). */
  on(eventType: string, handler: OutboxHandler): void {
    this.handlers.set(eventType, [...(this.handlers.get(eventType) ?? []), handler]);
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.jobs.work<OutboxJob>(QUEUES.outboxEvent.name, (job) => this.deliver(job).then());
    await this.jobs.work(QUEUES.outboxSweep.name, () => this.sweep().then());
    await this.jobs.schedule(QUEUES.outboxSweep.name, '* * * * *');
  }

  /** Delivers one event. Returns false when it was already processed (or is being processed). */
  async deliver({ tenantId, eventId }: OutboxJob): Promise<boolean> {
    try {
      return await withTenantTransaction(this.db, tenantId, async (tx) => {
        const [event] = await tx
          .select()
          .from(outboxEvent)
          .where(and(eq(outboxEvent.id, eventId), isNull(outboxEvent.processedAt)))
          .for('update', { skipLocked: true });
        if (!event) return false;
        for (const handler of this.handlers.get(event.eventType) ?? []) {
          await this.notifications.createForEvent(tx, event, await handler(tx, event));
        }
        await tx
          .update(outboxEvent)
          .set({
            processedAt: new Date(),
            attempts: sql`${outboxEvent.attempts} + 1`,
            lastError: null,
          })
          .where(eq(outboxEvent.id, eventId));
        return true;
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error({ err: error, eventId }, 'Outbox event delivery failed');
      await withTenantTransaction(this.db, tenantId, (tx) =>
        tx
          .update(outboxEvent)
          .set({ attempts: sql`${outboxEvent.attempts} + 1`, lastError: message.slice(0, 500) })
          .where(eq(outboxEvent.id, eventId)),
      );
      // The job fails, so pg-boss retries it with a growing delay.
      throw error;
    }
  }

  /**
   * Safety net, every minute: sends a new job for the events still waiting (a job lost or failed
   * too many times). Reads the pending events of every tenant in the platform scope (D-040).
   */
  async sweep(): Promise<number> {
    const pending = await withPlatformTransaction(this.db, (tx) =>
      tx
        .select({ id: outboxEvent.id, tenantId: outboxEvent.tenantId })
        .from(outboxEvent)
        .where(
          and(
            isNull(outboxEvent.processedAt),
            lt(outboxEvent.attempts, MAX_DELIVERY_ATTEMPTS),
            lt(outboxEvent.occurredAt, sql`now() - make_interval(secs => ${SWEEP_DELAY_SECONDS})`),
          ),
        )
        .orderBy(asc(outboxEvent.occurredAt))
        .limit(SWEEP_BATCH),
    );
    for (const event of pending) {
      const job: OutboxJob = { tenantId: event.tenantId, eventId: event.id };
      // One waiting job per event at most, whatever the number of sweeps.
      await this.jobs.send(QUEUES.outboxEvent.name, job, {
        singletonKey: event.id,
        singletonSeconds: 60,
      });
    }
    if (pending.length > 0) this.logger.warn({ count: pending.length }, 'Outbox events re-sent');
    return pending.length;
  }
}
