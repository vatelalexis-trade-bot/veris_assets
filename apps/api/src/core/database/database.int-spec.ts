import { sql } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { connectionConfig, migrateDatabase } from '../../../scripts/db/admin.js';
import { seedDatabase } from '../../../scripts/db/seed.js';
import { tenants } from '../../../scripts/db/seed-data.js';
import { loadToolsEnv } from '../../../scripts/db/tools-env.js';
import { createDatabase, withTenantTransaction } from './database.js';
import { tenant } from '../../modules/iam/infrastructure/schema.js';

const env = loadToolsEnv();
// A single connection: every query below reuses the same session, as a busy pool would.
const pool = new pg.Pool({ ...connectionConfig(env, env.POSTGRES_TEST_DB, 'app'), max: 1 });
const db = createDatabase(pool);
const [TENANT_A, TENANT_B] = tenants.map((row) => row.id) as [string, string];

afterAll(async () => {
  await pool.end();
});

describe('withTenantTransaction', () => {
  it('binds the transaction to the tenant', async () => {
    const rows = await withTenantTransaction(db, TENANT_A, (tx) =>
      tx.select({ id: tenant.id }).from(tenant),
    );
    expect(rows).toEqual([{ id: TENANT_A }]);
  });

  it('never leaks the tenant to the next use of the same connection', async () => {
    await withTenantTransaction(db, TENANT_B, (tx) => tx.select().from(tenant));
    const { rows } = await pool.query<{ tenant: string | null }>(
      'SELECT core.current_tenant_id() AS tenant',
    );
    expect(rows).toEqual([{ tenant: null }]);
    expect(await db.select().from(tenant)).toEqual([]);
  });

  it('rolls back everything when the work fails', async () => {
    await expect(
      withTenantTransaction(db, TENANT_A, async (tx) => {
        await tx.execute(
          sql`INSERT INTO core.outbox_event (tenant_id, event_type, aggregate_type, aggregate_id, payload)
              VALUES (${TENANT_A}, 'RolledBack', 'Test', uuidv7(), '{}')`,
        );
        throw new Error('business rule failed');
      }),
    ).rejects.toThrow('business rule failed');
    const remaining = await withTenantTransaction(db, TENANT_A, (tx) =>
      tx.execute(sql`SELECT 1 FROM core.outbox_event WHERE event_type = 'RolledBack'`),
    );
    expect(remaining.rows).toEqual([]);
  });
});

describe('migrations and seed', () => {
  async function counts(): Promise<Record<string, string>> {
    const admin = new pg.Client(connectionConfig(env, env.POSTGRES_TEST_DB, 'admin'));
    await admin.connect();
    try {
      const { rows } = await admin.query<Record<string, string>>(
        `SELECT (SELECT count(*) FROM drizzle.__drizzle_migrations) AS migrations,
                (SELECT count(*) FROM core.country) AS countries,
                (SELECT count(*) FROM core.currency) AS currencies,
                (SELECT count(*) FROM core.reference_data) AS reference_data,
                (SELECT count(*) FROM iam.tenant) AS tenants`,
      );
      return rows[0]!;
    } finally {
      await admin.end();
    }
  }

  it('can be replayed without error or change', async () => {
    const before = await counts();
    await migrateDatabase(env, 'test');
    await seedDatabase(env, 'test');
    expect(await counts()).toEqual(before);
  });

  it('loads the deterministic reference data and the two demo tenants', async () => {
    expect(await counts()).toMatchObject({ currencies: '4', reference_data: '7' });
    // Other test files may create tenants: only the two seeded ones are checked here.
    const ids = tenants.map((row) => row.id);
    const admin = new pg.Client(connectionConfig(env, env.POSTGRES_TEST_DB, 'admin'));
    await admin.connect();
    try {
      const { rowCount } = await admin.query('SELECT 1 FROM iam.tenant WHERE id = ANY($1)', [ids]);
      expect(rowCount).toBe(2);
    } finally {
      await admin.end();
    }
  });
});
