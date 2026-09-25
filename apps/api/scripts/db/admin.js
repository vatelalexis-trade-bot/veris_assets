import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { DB_ROLES } from '../../src/core/database/roles.js';
import { databaseName } from './tools-env.js';
const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../drizzle', import.meta.url));
export function connectionConfig(env, database, login) {
  const credentials = {
    admin: { user: env.POSTGRES_USER, password: env.POSTGRES_PASSWORD },
    migrator: { user: DB_ROLES.migrator, password: env.DB_MIGRATOR_PASSWORD },
    app: { user: DB_ROLES.app, password: env.DB_APP_PASSWORD },
  }[login];
  return { host: env.POSTGRES_HOST, port: env.POSTGRES_PORT, database, ...credentials };
}
async function withClient(config, work) {
  const client = new pg.Client(config);
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}
async function ensureRole(admin, role, password) {
  const { rowCount } = await admin.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [role]);
  const verb = rowCount === 0 ? 'CREATE' : 'ALTER';
  await admin.query(
    `${verb} ROLE ${pg.escapeIdentifier(role)} WITH LOGIN PASSWORD ${pg.escapeLiteral(password)} ` +
      'NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS',
  );
}
export async function bootstrapDatabase(env, target) {
  const database = databaseName(env, target);
  const name = pg.escapeIdentifier(database);
  await withClient(connectionConfig(env, 'postgres', 'admin'), async (admin) => {
    await ensureRole(admin, DB_ROLES.migrator, env.DB_MIGRATOR_PASSWORD);
    await ensureRole(admin, DB_ROLES.app, env.DB_APP_PASSWORD);
    const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      database,
    ]);
    if (rowCount === 0) await admin.query(`CREATE DATABASE ${name}`);
    await admin.query(`ALTER DATABASE ${name} OWNER TO ${DB_ROLES.migrator}`);
    await admin.query(`REVOKE ALL ON DATABASE ${name} FROM PUBLIC`);
    await admin.query(`GRANT CONNECT ON DATABASE ${name} TO ${DB_ROLES.app}`);
  });
}
export async function migrateDatabase(env, target) {
  await withClient(connectionConfig(env, databaseName(env, target), 'migrator'), (client) =>
    migrate(drizzle({ client, casing: 'snake_case' }), {
      migrationsFolder: MIGRATIONS_FOLDER,
      migrationsSchema: 'drizzle',
      migrationsTable: '__drizzle_migrations',
    }),
  );
}
export async function dropDatabase(env, target) {
  if (env.NODE_ENV === 'production') {
    throw new Error('Refusing to drop a database when NODE_ENV=production.');
  }
  const database = databaseName(env, target);
  await withClient(connectionConfig(env, 'postgres', 'admin'), async (admin) => {
    await admin.query(`DROP DATABASE IF EXISTS ${pg.escapeIdentifier(database)} WITH (FORCE)`);
  });
}
export { withClient };
//# sourceMappingURL=admin.js.map
