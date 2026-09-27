import { Global, Module } from '@nestjs/common';
import { DatabaseBackupJob } from './database-backup.js';
import { JobQueue } from './job-queue.js';

@Global()
@Module({ providers: [JobQueue, DatabaseBackupJob], exports: [JobQueue] })
export class JobsModule {}
