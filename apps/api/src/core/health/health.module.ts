import { Module } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';
import { postgresCheck, redisCheck, storageCheck } from './dependency-checks.js';
import { HealthController } from './health.controller.js';
import { READINESS_CHECKS } from './readiness-check.js';

@Module({
  controllers: [HealthController],
  providers: [
    {
      provide: READINESS_CHECKS,
      inject: [ENV],
      useFactory: (env: Env) => [postgresCheck(env), redisCheck(env), storageCheck(env)],
    },
  ],
})
export class HealthModule {}
