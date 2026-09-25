import { Global, Module } from '@nestjs/common';
import { JobQueue } from './job-queue.js';

@Global()
@Module({ providers: [JobQueue], exports: [JobQueue] })
export class JobsModule {}
