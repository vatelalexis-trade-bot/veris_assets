// Database administration used by `pnpm db:setup`, `pnpm db:reset` and the integration tests.
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { DB_ROLES } from '../../src/core/database/roles.js';
import { databaseName, type DatabaseTarget, type ToolsEnv } from './tools-env.js';

const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../drizzle', import.meta.url));

type Login = 'admin' | 'migrator' | 'app' | 'auth';

/** Connection settings for one of the roles on a given database. */
export function connectionConfig(env: ToolsEnv, database: string, login: Login): pg.ClientConfig {
  const credentials = {
    admin: { user: env.POSTGRES_USER, password: env.POSTGRES_PASSWORD },
    migrator: { user: DB_ROLES.migrator, password: env.DB_MIGRATOR_PASSWORD },
    app: { user: DB_ROLES.app, password: env.DB_APP_PASSWORD },
    auth: { user: DB_ROLES.auth, password: env.DB_AUTH_PASSWORD },
  }[login];
  return { host: env.POSTGRES_HOST, port: env.POSTGRES_PORT, database, ...credentials };
}

async function withClient<T>(config: pg.ClientConfig, work: (client: pg.Client) => Promise<T>) {
  const client = new pg.Client(config);
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

async function ensureRole(admin: pg.Client, role: string, password: string): Promise<void> {
  const { rowCount } = await admin.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [role]);
  const verb = rowCount === 0 ? 'CREATE' : 'ALTER';
  // DDL cannot take parameters: identifiers and literals are escaped by the pg library.
  await admin.query(
    `${verb} ROLE ${pg.escapeIdentifier(role)} WITH LOGIN PASSWORD ${pg.escapeLiteral(password)} ` +
      'NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS',
  );
}

/**
 * Creates or updates the roles and the database (idempotent). The database belongs to
 * va_migrator; va_app and va_auth may only connect. Runs with the superuser of the local container.
 */
export async function bootstrapDatabase(env: ToolsEnv, target: DatabaseTarget): Promise<void> {
  const database = databaseName(env, target);
  const name = pg.escapeIdentifier(database);
  await withClient(connectionConfig(env, 'postgres', 'admin'), async (admin) => {
    await ensureRole(admin, DB_ROLES.migrator, env.DB_MIGRATOR_PASSWORD);
    await ensureRole(admin, DB_ROLES.app, env.DB_APP_PASSWORD);
    await ensureRole(admin, DB_ROLES.auth, env.DB_AUTH_PASSWORD);
    const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      database,
    ]);
    if (rowCount === 0) await admin.query(`CREATE DATABASE ${name}`);
    await admin.query(`ALTER DATABASE ${name} OWNER TO ${DB_ROLES.migrator}`);
    await admin.query(`REVOKE ALL ON DATABASE ${name} FROM PUBLIC`);
    await admin.query(`GRANT CONNECT ON DATABASE ${name} TO ${DB_ROLES.app}, ${DB_ROLES.auth}`);
  });
}

/** Applies the pending migrations as va_migrator. Already applied migrations are skipped. */
export async function migrateDatabase(env: ToolsEnv, target: DatabaseTarget): Promise<void> {
  await withClient(connectionConfig(env, databaseName(env, target), 'migrator'), (client) =>
    migrate(drizzle({ client, casing: 'snake_case' }), {
      migrationsFolder: MIGRATIONS_FOLDER,
      migrationsSchema: 'drizzle',
      migrationsTable: '__drizzle_migrations',
    }),
  );
}

/**
 * Deletes the whole database. Refused in production and for any database other than the demo or
 * test one: this command is meant for fictitious data only.
 */
export async function dropDatabase(env: ToolsEnv, target: DatabaseTarget): Promise<void> {
  if (env.NODE_ENV === 'production') {
    throw new Error('Refusing to drop a database when NODE_ENV=production.');
  }
  const database = databaseName(env, target);
  await withClient(connectionConfig(env, 'postgres', 'admin'), async (admin) => {
    await admin.query(`DROP DATABASE IF EXISTS ${pg.escapeIdentifier(database)} WITH (FORCE)`);
  });
}

export { withClient };
