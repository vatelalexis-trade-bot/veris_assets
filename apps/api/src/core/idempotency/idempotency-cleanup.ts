import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { lt, sql } from 'drizzle-orm';
import { DATABASE, type Database, withPlatformTransaction } from '../database/database.js';
import { idempotencyKey } from '../database/schema.js';
import { JobQueue } from '../jobs/job-queue.js';
import { QUEUES } from '../jobs/queues.js';

/** Daily job `idempotency-cleanup` (docs/ARCHITECTURE.md §4.9): deletes the expired keys. */
@Injectable()
export class IdempotencyCleanup implements OnApplicationBootstrap {
  private readonly logger = new Logger(IdempotencyCleanup.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly jobs: JobQueue,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.jobs.work(QUEUES.idempotencyCleanup.name, () => this.purge().then());
    await this.jobs.schedule(QUEUES.idempotencyCleanup.name, '15 3 * * *');
  }

  /** Keys of every tenant, in the platform scope limited to expired keys (decision D-040). */
  async purge(): Promise<number> {
    const deleted = await withPlatformTransaction(this.db, (tx) =>
      tx
        .delete(idempotencyKey)
        .where(lt(idempotencyKey.expiresAt, sql`now()`))
        .returning({ id: idempotencyKey.id }),
    );
    this.logger.log({ count: deleted.length }, 'Expired idempotency keys deleted');
    return deleted.length;
  }
}
