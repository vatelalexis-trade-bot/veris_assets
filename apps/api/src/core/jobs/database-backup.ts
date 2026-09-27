import { spawn } from 'node:child_process';
import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';
import { JobQueue } from './job-queue.js';
import { QUEUES } from './queues.js';

/**
 * Nightly backup of the online demonstration (P16-4, D-106): runs `pnpm db:backup --database-only
 * --upload` (dump checked by its manifest, copied to the storage, last 14 kept) on the schedule
 * given in BACKUP_SCHEDULE. Off when it is not set, as in development.
 */
@Injectable()
export class DatabaseBackupJob implements OnApplicationBootstrap {
  private readonly logger = new Logger(DatabaseBackupJob.name);

  constructor(
    private readonly jobs: JobQueue,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.env.BACKUP_SCHEDULE) return;
    await this.jobs.work(QUEUES.databaseBackup.name, () => this.run());
    await this.jobs.schedule(QUEUES.databaseBackup.name, this.env.BACKUP_SCHEDULE);
  }

  run(): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn('pnpm', ['db:backup', '--database-only', '--upload'], {
        stdio: 'inherit',
        env: process.env,
      });
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) {
          this.logger.log('Database backup done');
          resolve();
        } else {
          reject(new Error(`Database backup failed (${code})`));
        }
      });
    });
  }
}
