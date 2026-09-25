import { Injectable } from '@nestjs/common';
import { getRequestContext } from '../context/request-context.js';
import type { Transaction } from '../database/database.js';
import { outboxEvent } from '../database/schema.js';
import { JobQueue } from '../jobs/job-queue.js';
import { QUEUES } from '../jobs/queues.js';

/** Values of an event payload: identifiers and codes only, never personal data (SPEC §8.5). */
export type OutboxPayload = Readonly<Record<string, string | number | boolean | null>>;

export interface OutboxEventInput {
  tenantId: string;
  /** `<module>.<resource>.<what happened>`, e.g. `iam.user.roles-changed`. */
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload?: OutboxPayload;
}

/** Data of the `outbox-event` job. */
export interface OutboxJob {
  tenantId: string;
  eventId: string;
}

/**
 * Writes business events (outbox pattern, SPEC §15). The event and the job that delivers it are
 * written in the transaction of the operation: a committed operation never loses its
 * notifications, and a rolled-back one never sends any.
 */
@Injectable()
export class Outbox {
  constructor(private readonly jobs: JobQueue) {}

  async publish(tx: Transaction, event: OutboxEventInput): Promise<string> {
    const [row] = await tx
      .insert(outboxEvent)
      .values({
        tenantId: event.tenantId,
        eventType: event.eventType,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        payload: event.payload ?? {},
        correlationId: getRequestContext()?.correlationId ?? null,
      })
      .returning({ id: outboxEvent.id });
    const job: OutboxJob = { tenantId: event.tenantId, eventId: row!.id };
    await this.jobs.sendIn(tx, QUEUES.outboxEvent.name, job);
    return row!.id;
  }
}
