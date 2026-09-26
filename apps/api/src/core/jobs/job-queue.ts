import { randomUUID } from 'node:crypto';
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { fromDrizzle, PgBoss, type Job, type SendOptions } from 'pg-boss';
import { runWithRequestContext } from '../context/request-context.js';
import { ENV, type Env } from '../config/env.js';
import type { Transaction } from '../database/database.js';
import { DB_ROLES } from '../database/roles.js';
import { JOB_SCHEMA, type QueueName } from './queues.js';

/**
 * Job queue of the API (pg-boss, docs/ARCHITECTURE.md §4.9). pg-boss connects as va_jobs, which
 * owns only the queue schema (decision D-039). Jobs are added inside the business transaction
 * (`sendIn`), so a job exists if and only if the operation is committed.
 * Workers and schedules run only when JOBS_ENABLED is true (off in automated tests).
 */
@Injectable()
export class JobQueue implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(JobQueue.name);
  private readonly boss: PgBoss;
  readonly workersEnabled: boolean;

  constructor(@Inject(ENV) env: Env) {
    this.workersEnabled = env.JOBS_ENABLED;
    this.boss = new PgBoss({
      host: env.POSTGRES_HOST,
      port: env.POSTGRES_PORT,
      database: env.POSTGRES_DB,
      user: DB_ROLES.jobs,
      password: env.DB_JOBS_PASSWORD,
      schema: JOB_SCHEMA,
      // The schema and the queues are installed by `pnpm db:setup`, never by the running API.
      migrate: false,
      createSchema: false,
      supervise: env.JOBS_ENABLED,
      schedule: env.JOBS_ENABLED,
      useListenNotify: env.JOBS_ENABLED,
      max: 4,
      application_name: 'virtus-assets-jobs',
    });
  }

  private starting: Promise<unknown> | undefined;

  async onModuleInit(): Promise<void> {
    this.boss.on('error', (error) => this.logger.error({ err: error }, 'Job queue error'));
    if (this.workersEnabled) await this.started();
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.starting) await this.boss.stop({ graceful: true, timeout: 5000 });
  }

  /** pg-boss connects on first use when the workers are off (tests without jobs need no database). */
  private started(): Promise<unknown> {
    this.starting ??= this.boss.start();
    return this.starting;
  }

  /** Adds a job in the given business transaction. */
  async sendIn(
    tx: Transaction,
    queue: QueueName,
    data: object,
    options: Omit<SendOptions, 'db'> = {},
  ): Promise<void> {
    await this.started();
    await this.boss.send(queue, data, { ...options, db: fromDrizzle(tx, sql) });
  }

  /** Adds a job outside any transaction (safety nets, jobs that trigger other jobs). */
  async send(queue: QueueName, data: object, options: SendOptions = {}): Promise<void> {
    await this.started();
    await this.boss.send(queue, data, options);
  }

  /**
   * Processes the jobs of a queue, one at a time. Each job runs in its own context (source JOB,
   * new correlation ID), so its audit entries and logs are told apart from web requests.
   */
  async work<T extends object>(
    queue: QueueName,
    handler: (data: T) => Promise<void>,
  ): Promise<void> {
    if (!this.workersEnabled) return;
    // Every 2 seconds, even while LISTEN/NOTIFY is on (pg-boss then waits 30 s by default): the
    // jobs added inside a business transaction do not always wake the workers.
    const polling = { pollingIntervalSeconds: 2, notifyPollingIntervalSeconds: 2 };
    await this.boss.work<T>(queue, polling, async ([job]: Job<T>[]) => {
      if (!job) return;
      await runWithRequestContext({ correlationId: randomUUID(), source: 'JOB' }, () =>
        handler(job.data),
      );
    });
  }

  /** Runs a queue on a schedule (cron, UTC). */
  async schedule(queue: QueueName, cron: string): Promise<void> {
    if (!this.workersEnabled) return;
    await this.boss.schedule(queue, cron, null, { tz: 'UTC' });
  }
}
