import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { AuditModule } from './audit/audit.module.js';
import { ConfigModule } from './config/config.module.js';
import { ENV, type Env } from './config/env.js';
import { DatabaseModule } from './database/database.module.js';
import { EmailModule } from './email/email.module.js';
import { HealthModule } from './health/health.module.js';
import { buildPinoHttpOptions } from './logging/logger.options.js';
import { RedisModule } from './redis/redis.module.js';
import { ReferenceController } from './reference/reference.controller.js';
import { SecurityModule } from './security/security.module.js';

/**
 * Technical layer shared by the business modules (decision D-022): configuration, logging,
 * database, Redis, audit, email, rate limiting, health probes. It holds no business rule and never imports a business module.
 */
@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({ pinoHttp: buildPinoHttpOptions(env) }),
    }),
    DatabaseModule,
    RedisModule,
    SecurityModule,
    AuditModule,
    EmailModule,
    HealthModule,
  ],
  controllers: [ReferenceController],
})
export class CoreModule {}
