import { AsyncLocalStorage } from 'node:async_hooks';
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

const requestTransaction = new AsyncLocalStorage<Transaction>();

/**
 * Runs `work` in one transaction covering the whole request (idempotent routes, docs/ARCHITECTURE.md
 * §4.8). The transactions opened inside by the business code become savepoints of it: the
 * idempotency key, the operation, its audit entries and its outbox events commit or roll back
 * together.
 */
export async function withRequestTransaction<T>(
  db: Database,
  work: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction((tx) => requestTransaction.run(tx, () => work(tx)));
}

interface TransactionOptions {
  /**
   * Always opens a separate transaction, even inside a request transaction: for records that must
   * survive a rollback of the operation (access denials, failed sign-ins).
   */
  separate?: boolean;
}

/** Opens a transaction, or a savepoint of the request transaction when there is one. */
function begin<T>(
  db: Database,
  options: TransactionOptions,
  work: (tx: Transaction) => Promise<T>,
) {
  const ambient = options.separate ? undefined : requestTransaction.getStore();
  return ambient ? ambient.transaction(work) : db.transaction(work);
}

/**
 * Sets the scope of the transaction: its tenant (row level security then only shows and accepts
 * rows of that tenant) and whether the platform scope is on. Both settings are local to the
 * transaction, so they never leak to the next request using the same pooled connection; both are
 * always set, so that a savepoint never inherits the scope of the previous one.
 */
async function setScope(tx: Transaction, tenantId: string | null, platform: boolean) {
  await tx.execute(
    sql`SELECT set_config('app.tenant_id', ${tenantId ?? ''}, true), set_config('app.platform_scope', ${platform ? 'on' : ''}, true)`,
  );
}

/** Runs `work` in a transaction bound to one tenant. */
export async function withTenantTransaction<T>(
  db: Database,
  tenantId: string,
  work: (tx: Transaction) => Promise<T>,
  options: TransactionOptions = {},
): Promise<T> {
  return begin(db, options, async (tx) => {
    await setScope(tx, tenantId, false);
    return work(tx);
  });
}

/**
 * Runs `work` without any tenant: only rows without tenant are visible (platform users' own data,
 * platform-level audit entries).
 */
export async function withoutTenantTransaction<T>(
  db: Database,
  work: (tx: Transaction) => Promise<T>,
  options: TransactionOptions = {},
): Promise<T> {
  return begin(db, options, async (tx) => {
    await setScope(tx, null, false);
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
  return begin(db, {}, async (tx) => {
    await setScope(tx, null, true);
    return work(tx);
  });
}

/**
 * Inside a platform transaction, targets one tenant as well: the Platform Administrator's action
 * on that tenant (activation, settings) is then recorded in the tenant's own audit log and
 * workflow history. Never use it in tenant code: a tenant transaction keeps its tenant.
 */
export async function actOnTenant(tx: Transaction, tenantId: string): Promise<void> {
  await setScope(tx, tenantId, true);
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
