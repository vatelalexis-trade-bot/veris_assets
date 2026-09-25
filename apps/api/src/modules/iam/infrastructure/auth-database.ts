import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import type { Env } from '../../../core/config/env.js';
import { DB_ROLES } from '../../../core/database/roles.js';

/** Database access of the authentication component, as va_auth (decision D-030). */
export type AuthDatabase = NodePgDatabase;
export const AUTH_DATABASE = Symbol('AUTH_DATABASE');
export const AUTH_POOL = Symbol('AUTH_POOL');

export function createAuthPool(env: Env): pg.Pool {
  return new pg.Pool({
    host: env.POSTGRES_HOST,
    port: env.POSTGRES_PORT,
    database: env.POSTGRES_DB,
    user: DB_ROLES.auth,
    password: env.DB_AUTH_PASSWORD,
    max: 5,
    connectionTimeoutMillis: 2000,
    application_name: 'virtus-assets-auth',
  });
}

export function createAuthDatabase(pool: pg.Pool): AuthDatabase {
  return drizzle({ client: pool, casing: 'snake_case' });
}
