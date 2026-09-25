import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { ConfigModule } from './config/config.module.js';
import { ENV, type Env } from './config/env.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { buildPinoHttpOptions } from './logging/logger.options.js';

/**
 * Technical layer shared by the business modules (decision D-022): configuration, logging,
 * database access, health probes. It holds no business rule and never imports a business module.
 */
@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({ pinoHttp: buildPinoHttpOptions(env) }),
    }),
    DatabaseModule,
    HealthModule,
  ],
})
export class CoreModule {}
