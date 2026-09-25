// Database security guarantees (docs/ARCHITECTURE.md §4.5, SPEC §10.4 and §20). These checks are
// generic: a table added in a later phase is covered automatically.
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connectionConfig } from '../../../scripts/db/admin.js';
import { tenants } from '../../../scripts/db/seed-data.js';
import { loadToolsEnv } from '../../../scripts/db/tools-env.js';
import { DB_ROLES } from './roles.js';

const APPLICATION_SCHEMAS = [
  'core',
  'audit',
  'iam',
  'investor',
  'issuance',
  'registry',
  'servicing',
];
const EXPECTED_APPEND_ONLY_TABLES = ['audit.audit_event', 'core.workflow_transition'];
const [TENANT_A, TENANT_B] = tenants.map((tenant) => tenant.id);

const env = loadToolsEnv();
const clients: Record<'admin' | 'migrator' | 'app', pg.Client> = {
  admin: new pg.Client(connectionConfig(env, env.POSTGRES_TEST_DB, 'admin')),
  migrator: new pg.Client(connectionConfig(env, env.POSTGRES_TEST_DB, 'migrator')),
  app: new pg.Client(connectionConfig(env, env.POSTGRES_TEST_DB, 'app')),
};

/** Runs statements in a transaction bound to a tenant (or none), then rolls back. */
async function inTenant<T>(
  client: pg.Client,
  tenantId: string | null,
  work: () => Promise<T>,
): Promise<T> {
  await client.query('BEGIN');
  try {
    if (tenantId) await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    return await work();
  } finally {
    await client.query('ROLLBACK');
  }
}

async function errorCode(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return (error as { code?: string }).code;
  }
}

beforeAll(async () => {
  await Promise.all(Object.values(clients).map((client) => client.connect()));
});

afterAll(async () => {
  await Promise.all(Object.values(clients).map((client) => client.end()));
});

describe('roles', () => {
  it.each([DB_ROLES.app, DB_ROLES.auth])('gives %s no administrative power', async (roleName) => {
    const { rows } = await clients.admin.query<Record<string, boolean>>(
      'SELECT rolsuper, rolbypassrls, rolcreaterole, rolcreatedb FROM pg_roles WHERE rolname = $1',
      [roleName],
    );
    expect(rows).toEqual([
      { rolsuper: false, rolbypassrls: false, rolcreaterole: false, rolcreatedb: false },
    ]);
  });

  it('confines the authentication role to identity tables (decision D-030)', async () => {
    const { rows } = await clients.admin.query<{ table: string }>(
      `SELECT format('%I.%I', n.nspname, c.relname) AS table
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind = 'r' AND n.nspname = ANY($1)
          AND has_table_privilege($2, c.oid, 'SELECT, INSERT, UPDATE, DELETE')`,
      [APPLICATION_SCHEMAS, DB_ROLES.auth],
    );
    // "user" is a reserved word, hence quoted by format('%I').
    expect(rows.map((row) => row.table).sort()).toEqual([
      'iam."user"',
      'iam.account',
      'iam.permission',
      'iam.role',
      'iam.role_permission',
      'iam.session',
      'iam.two_factor',
      'iam.user_invitation',
      'iam.user_role',
      'iam.verification',
    ]);
  });

  it('keeps sessions, credentials and TOTP secrets out of reach of the API role', async () => {
    const { rows } = await clients.admin.query<{ allowed: boolean }>(
      `SELECT bool_or(has_table_privilege($1, t, 'SELECT, INSERT, UPDATE, DELETE')) AS allowed
         FROM unnest(ARRAY['iam.session', 'iam.account', 'iam.verification', 'iam.two_factor']::regclass[]) AS t`,
      [DB_ROLES.app],
    );
    expect(rows[0]?.allowed).toBe(false);
  });

  it('makes the migrator own every application table, and the API role none', async () => {
    const { rows } = await clients.admin.query<{ owner: string }>(
      `SELECT DISTINCT pg_get_userbyid(c.relowner) AS owner
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind = 'r' AND n.nspname = ANY($1)`,
      [APPLICATION_SCHEMAS],
    );
    expect(rows.map((row) => row.owner)).toEqual([DB_ROLES.migrator]);
  });

  it('prevents the API role from creating objects or reading the migration history', async () => {
    const { rows } = await clients.admin.query<Record<string, boolean>>(
      `SELECT has_schema_privilege($1, 'core', 'CREATE') AS core_create,
              has_schema_privilege($1, 'public', 'CREATE') AS public_create,
              has_schema_privilege($1, 'drizzle', 'USAGE') AS migrations_usage`,
      [DB_ROLES.app],
    );
    expect(rows[0]).toEqual({ core_create: false, public_create: false, migrations_usage: false });
  });
});

describe('tenant isolation (row level security)', () => {
  it('is enabled and forced on every table that has a tenant column', async () => {
    const { rows } = await clients.admin.query<{
      table: string;
      enabled: boolean;
      forced: boolean;
    }>(
      `SELECT format('%I.%I', n.nspname, c.relname) AS table,
              c.relrowsecurity AS enabled, c.relforcerowsecurity AS forced
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind = 'r' AND n.nspname = ANY($1)
          AND (EXISTS (SELECT 1 FROM pg_attribute a
                        WHERE a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped)
               OR (n.nspname, c.relname) = ('iam', 'tenant'))`,
      [APPLICATION_SCHEMAS],
    );
    expect(rows.length).toBeGreaterThanOrEqual(5);
    const unprotected = rows.filter((row) => !row.enabled || !row.forced).map((row) => row.table);
    expect(unprotected).toEqual([]);
  });

  it('shows no tenant data when no tenant is set', async () => {
    const { rows } = await inTenant(clients.app, null, () =>
      clients.app.query('SELECT id FROM iam.tenant'),
    );
    expect(rows).toEqual([]);
  });

  it('shows only the current tenant', async () => {
    const { rows } = await inTenant(clients.app, TENANT_A!, () =>
      clients.app.query<{ id: string }>('SELECT id FROM iam.tenant'),
    );
    expect(rows.map((row) => row.id)).toEqual([TENANT_A]);
  });

  it('refuses to write a row for another tenant', async () => {
    const code = await inTenant(clients.app, TENANT_A!, () =>
      errorCode(
        clients.app.query(
          `INSERT INTO core.outbox_event (tenant_id, event_type, aggregate_type, aggregate_id, payload)
           VALUES ($1, 'TestEvent', 'Test', uuidv7(), '{}')`,
          [TENANT_B],
        ),
      ),
    );
    expect(code).toBe('42501'); // new row violates row-level security policy
  });

  it("keeps a tenant's rows invisible to another tenant", async () => {
    await clients.app.query('BEGIN');
    try {
      await clients.app.query("SELECT set_config('app.tenant_id', $1, true)", [TENANT_A]);
      await clients.app.query(
        `INSERT INTO core.outbox_event (tenant_id, event_type, aggregate_type, aggregate_id, payload)
         VALUES ($1, 'TestEvent', 'Test', uuidv7(), '{}')`,
        [TENANT_A],
      );
      await clients.app.query("SELECT set_config('app.tenant_id', $1, true)", [TENANT_B]);
      const { rows } = await clients.app.query(
        "SELECT 1 FROM core.outbox_event WHERE event_type = 'TestEvent'",
      );
      expect(rows).toEqual([]);
    } finally {
      await clients.app.query('ROLLBACK');
    }
  });
});

describe('append-only tables', () => {
  it('protects at least the expected tables with triggers', async () => {
    const { rows } = await clients.admin.query<{ table: string }>(
      `SELECT DISTINCT format('%I.%I', n.nspname, c.relname) AS table
         FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE t.tgname = 'append_only_row'`,
    );
    expect(rows.map((row) => row.table)).toEqual(
      expect.arrayContaining(EXPECTED_APPEND_ONLY_TABLES),
    );
  });

  it('never grants UPDATE, DELETE or TRUNCATE on them to the API role', async () => {
    const { rows } = await clients.admin.query<{ table: string; forbidden: boolean }>(
      `SELECT format('%I.%I', n.nspname, c.relname) AS table,
              has_table_privilege($1, c.oid, 'UPDATE')
              OR has_table_privilege($1, c.oid, 'DELETE')
              OR has_table_privilege($1, c.oid, 'TRUNCATE') AS forbidden
         FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE t.tgname = 'append_only_row'`,
      [DB_ROLES.app],
    );
    expect(rows.filter((row) => row.forbidden)).toEqual([]);
  });

  it('refuses UPDATE, DELETE and TRUNCATE even to the table owner', async () => {
    await clients.migrator.query('BEGIN');
    try {
      await clients.migrator.query("SELECT set_config('app.tenant_id', $1, true)", [TENANT_A]);
      await clients.migrator.query(
        `INSERT INTO core.workflow_transition (tenant_id, resource_type, resource_id, to_status)
         VALUES ($1, 'Test', uuidv7(), 'DRAFT')`,
        [TENANT_A],
      );
      for (const statement of [
        "UPDATE core.workflow_transition SET to_status = 'APPROVED'",
        'DELETE FROM core.workflow_transition',
        'TRUNCATE core.workflow_transition',
      ]) {
        await clients.migrator.query('SAVEPOINT attempt');
        expect(await errorCode(clients.migrator.query(statement)), statement).toBe('23001');
        await clients.migrator.query('ROLLBACK TO SAVEPOINT attempt');
      }
    } finally {
      await clients.migrator.query('ROLLBACK');
    }
  });

  it('lets the API role append rows', async () => {
    const { rowCount } = await inTenant(clients.app, TENANT_A!, () =>
      clients.app.query(
        `INSERT INTO audit.audit_event (tenant_id, action, source, result)
         VALUES ($1, 'TEST', 'SYSTEM', 'SUCCESS')`,
        [TENANT_A],
      ),
    );
    expect(rowCount).toBe(1);
  });
});
