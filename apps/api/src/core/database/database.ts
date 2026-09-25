import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import type { Env } from '../config/env.js';
import { currentUser } from '../context/request-context.js';
import { AppError } from '../errors/app-error.js';
import { DB_ROLES } from './roles.js';

export type Database = NodePgDatabase;
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/** Injection tokens. */
export const PG_POOL = Symbol('PG_POOL');
export const DATABASE = Symbol('DATABASE');

/** Connection pool of the API. It always connects as va_app, never as owner or superuser. */
export function createPool(env: Env): pg.Pool {
  return new pg.Pool({
    host: env.POSTGRES_HOST,
    port: env.POSTGRES_PORT,
    database: env.POSTGRES_DB,
    user: DB_ROLES.app,
    password: env.DB_APP_PASSWORD,
    max: 10,
    connectionTimeoutMillis: 2000,
    application_name: 'virtus-assets-api',
  });
}

export function createDatabase(pool: pg.Pool): Database {
  return drizzle({ client: pool, casing: 'snake_case' });
}

/**
 * Runs `work` in a transaction bound to one tenant: row level security then only shows and accepts
 * rows of that tenant. The setting is local to the transaction, so it can never leak to the next
 * request using the same pooled connection.
 */
export async function withTenantTransaction<T>(
  db: Database,
  tenantId: string,
  work: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
    return work(tx);
  });
}

/**
 * Transaction in the platform scope (docs/ARCHITECTURE.md §4.5): used only by Platform
 * Administrator routes, after the permission check. It gives access to the tenant list and to
 * nothing else — business tables keep their tenant isolation.
 */
export async function withPlatformTransaction<T>(
  db: Database,
  work: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.platform_scope', 'on', true)`);
    return work(tx);
  });
}

/**
 * Transaction bound to the signed-in user's tenant, taken from the session (never from the
 * request, SPEC §20). Platform users have no tenant: tenant data stays out of their reach.
 */
export async function withCurrentTenant<T>(
  db: Database,
  work: (tx: Transaction, tenantId: string) => Promise<T>,
): Promise<T> {
  const { tenantId } = currentUser();
  if (!tenantId) throw new AppError('PERMISSION_DENIED');
  return withTenantTransaction(db, tenantId, (tx) => work(tx, tenantId));
}
