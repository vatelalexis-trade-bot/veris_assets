// The demonstration data (SPEC §28, D-017, docs/BACKLOG.md P15-6): it covers the statuses the demo
// needs, its history is consistent with the application's own rules, and loading it again
// changes nothing.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedDatabase } from '../../scripts/db/seed.js';
import { loadToolsEnv } from '../../scripts/db/tools-env.js';
import { startIntegrationApp, type IntegrationApp } from './integration-app.js';

let ctx: IntegrationApp;

async function count(query: string, values: unknown[] = []): Promise<number> {
  const { rows } = await ctx.admin.query<{ total: string }>(query, values);
  return Number.parseInt(rows[0]!.total, 10);
}

/** One query at a time: the test client is a single connection. */
async function counts(tables: readonly string[]): Promise<number[]> {
  const totals: number[] = [];
  for (const table of tables) totals.push(await count(`SELECT count(*) AS total FROM ${table}`));
  return totals;
}

beforeAll(async () => {
  ctx = await startIntegrationApp();
});

afterAll(async () => {
  await ctx.close();
});

describe('demonstration data (SPEC §28)', () => {
  it('covers every status the demonstration needs', async () => {
    const northwind = `(SELECT id FROM iam.tenant WHERE legal_name LIKE 'Northwind%')`;
    // 20 in the demo data; other test files add their own.
    expect(
      await count(`SELECT count(*) AS total FROM investor.investor WHERE tenant_id = ${northwind}`),
    ).toBeGreaterThanOrEqual(20);
    for (const [label, query] of [
      [
        'a KYC/KYB expired',
        `SELECT count(*) AS total FROM investor.investor WHERE kyc_status = 'EXPIRED'`,
      ],
      [
        'an investor not eligible',
        `SELECT count(*) AS total FROM investor.investor WHERE eligibility_status = 'NOT_ELIGIBLE'`,
      ],
      [
        'eligible investors',
        `SELECT count(*) AS total FROM investor.investor WHERE eligibility_status = 'ELIGIBLE'`,
      ],
      [
        'a refusal for an excluded country',
        `SELECT count(*) AS total FROM investor.eligibility_assessment
         WHERE result = 'NOT_ELIGIBLE' AND rules @> '[{"code": "COUNTRY_EXCLUDED", "passed": false}]'`,
      ],
      [
        'a rejected subscription',
        `SELECT count(*) AS total FROM registry.subscription WHERE status = 'REJECTED'`,
      ],
      [
        'a transfer waiting for compliance',
        `SELECT count(*) AS total FROM registry.transfer_request WHERE status = 'COMPLIANCE_REVIEW'`,
      ],
      [
        'a paid coupon',
        `SELECT count(*) AS total FROM servicing.distribution WHERE status = 'PAID'`,
      ],
      ['notifications', `SELECT count(*) AS total FROM core.notification`],
      [
        'an audit log',
        `SELECT count(*) AS total FROM audit.audit_event WHERE action = 'DISTRIBUTION_PAID'`,
      ],
    ] as const) {
      expect(await count(query), label).toBeGreaterThan(0);
    }
    const { rows } = await ctx.admin.query<{ name: string }>(
      `SELECT name FROM issuance.issuance WHERE asset_category IN ('PRIVATE_DEBT', 'RENEWABLE_ENERGY')`,
    );
    expect(rows.map((row) => row.name)).toEqual(
      expect.arrayContaining(['Northwind Private Debt Fund I', 'Aurora Solar Park 2027']),
    );
  });

  it('gives the second organisation its own issuance, invisible to the first', async () => {
    const contoso = await ctx.signIn('contoso.admin@example.com');
    const theirs = (await contoso.get('/api/v1/issuances?pageSize=100').expect(200)).body as {
      data: { code: string }[];
    };
    expect(theirs.data.map((row) => row.code)).toContain('CRE28');
    expect(theirs.data.map((row) => row.code)).not.toContain('NWPD1');
    const admin = await ctx.signIn('northwind.admin1@example.com');
    const ours = (await admin.get('/api/v1/issuances?pageSize=100').expect(200)).body as {
      data: { code: string }[];
    };
    expect(ours.data.map((row) => row.code)).not.toContain('CRE28');
  });

  it('keeps a paid coupon that the application calculates again identically', async () => {
    const { rows } = await ctx.admin.query<{ id: string; issuance_id: string }>(
      `SELECT d.id, d.issuance_id FROM servicing.distribution d
       JOIN issuance.issuance i ON i.id = d.issuance_id
       WHERE i.code = 'NWGN' AND d.status = 'PAID'`,
    );
    const paid = rows[0]!;
    const admin = await ctx.signIn('northwind.admin1@example.com');
    const check = (
      await admin.post(`/api/v1/distributions/${paid.id}/recalculate-check`).expect(200)
    ).body as { snapshotReproducible: boolean; identical: boolean; totalGrossAmount: string };
    expect(check).toMatchObject({
      snapshotReproducible: true,
      identical: true,
      totalGrossAmount: '12500.00',
    });
    const reconciliation = (
      await admin.get(`/api/v1/ledger/reconciliation?issuanceId=${paid.issuance_id}`).expect(200)
    ).body as { consistent: boolean };
    expect(reconciliation.consistent).toBe(true);
    // Its investor received 2 500.00 € (100 units at 5 % over six months).
    const investor = await ctx.signIn('investor.a@example.com');
    const lines = (await investor.get(`/api/v1/distributions/${paid.id}/lines`).expect(200))
      .body as { grossAmount: string }[];
    expect(lines).toEqual([expect.objectContaining({ grossAmount: '2500.00' })]);
  });

  it('changes nothing when loaded again (deterministic identifiers)', async () => {
    const tables = [
      'investor.investor',
      'investor.eligibility_assessment',
      'issuance.issuance',
      'registry.subscription',
      'registry.ledger_entry',
      'servicing.distribution',
      'core.notification',
      'audit.audit_event',
      'core.workflow_transition',
    ];
    const before = await counts(tables);
    await seedDatabase(loadToolsEnv(), 'test');
    const after = await counts(tables);
    expect(after).toEqual(before);
  });
});
