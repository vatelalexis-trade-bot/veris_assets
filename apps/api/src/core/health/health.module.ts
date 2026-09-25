import { Module } from '@nestjs/common';
import type pg from 'pg';
import { ENV, type Env } from '../config/env.js';
import { PG_POOL } from '../database/database.js';
import { postgresCheck, redisCheck, storageCheck } from './dependency-checks.js';
import { HealthController } from './health.controller.js';
import { READINESS_CHECKS } from './readiness-check.js';

@Module({
  controllers: [HealthController],
  providers: [
    {
      provide: READINESS_CHECKS,
      inject: [ENV, PG_POOL],
      useFactory: (env: Env, pool: pg.Pool) => [
        postgresCheck(pool),
        redisCheck(env),
        storageCheck(env),
      ],
    },
  ],
})
export class HealthModule {}
