import { Global, Inject, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import type pg from 'pg';
import { ENV, type Env } from '../config/env.js';
import { createDatabase, createPool, DATABASE, PG_POOL } from './database.js';

/** Provides the connection pool (`PG_POOL`) and the Drizzle client (`DATABASE`) everywhere. */
@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [ENV],
      useFactory: (env: Env) => {
        const pool = createPool(env);
        // An idle connection may fail (database restarted, network cut). Without this listener the
        // error would be unhandled and would stop the process; the pool replaces the connection.
        pool.on('error', (error) => new Logger('DatabasePool').error(error));
        return pool;
      },
    },
    { provide: DATABASE, inject: [PG_POOL], useFactory: (pool: pg.Pool) => createDatabase(pool) },
  ],
  exports: [PG_POOL, DATABASE],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
