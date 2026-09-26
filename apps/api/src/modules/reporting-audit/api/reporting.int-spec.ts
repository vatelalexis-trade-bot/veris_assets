// Dashboards, "To do" queue and indicators (phase 15a, docs/BACKLOG.md P15-1, P15-2, P15-4).
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startIntegrationApp, type IntegrationApp } from '../../../test/integration-app.js';
import { closedIssuance } from '../../../test/registry-fixtures.js';

type Agent = ReturnType<typeof request.agent>;
let ctx: IntegrationApp;
let operator: Agent;
let admin1: Agent;
let admin2: Agent;

interface Task {
  kind: string;
  resourceId: string;
  reference: string | null;
}

async function count(query: string): Promise<number> {
  const { rows } = await ctx.admin.query<{ total: string }>(query);
  return Number.parseInt(rows[0]!.total, 10);
}

beforeAll(async () => {
  ctx = await startIntegrationApp();
  operator = await ctx.signIn('northwind.operator@example.com');
  admin1 = await ctx.signIn('northwind.admin1@example.com');
  admin2 = await ctx.signIn('northwind.admin2@example.com');
});

afterAll(async () => {
  await ctx.close();
});

describe("issuer's dashboard (SPEC §13.1, §18)", () => {
  it('gives the figures of the organisation, from its own data only', async () => {
    const dashboard = (await admin1.get('/api/v1/dashboard').expect(200)).body as {
      issuances: number;
      activeIssuances: number;
      administered: Record<string, string>;
      investors: number;
      holders: number;
      pendingTransfers: number;
      upcomingPayments: { code: string; overdue: boolean }[];
      issuanceRows: { code: string }[];
      recentActivity: unknown[];
    };
    const northwind = `(SELECT id FROM iam.tenant WHERE legal_name LIKE 'Northwind%')`;
    expect(dashboard.investors).toBe(
      await count(`SELECT count(*) AS total FROM investor.investor WHERE tenant_id = ${northwind}`),
    );
    expect(dashboard.activeIssuances).toBe(
      await count(
        `SELECT count(*) AS total FROM issuance.issuance WHERE tenant_id = ${northwind} AND status = 'ACTIVE'`,
      ),
    );
    expect(dashboard.holders).toBeGreaterThanOrEqual(3);
    expect(Number.parseInt(dashboard.administered.EUR!, 10)).toBeGreaterThan(0);
    // The due coupon of the green notes, not distributed yet (demo data).
    expect(dashboard.upcomingPayments).toContainEqual(
      expect.objectContaining({ code: 'NWGN', overdue: true }),
    );
    expect(dashboard.issuanceRows.map((row) => row.code)).toContain('NWPD1');
    expect(dashboard.recentActivity.length).toBeLessThanOrEqual(8);

    const contoso = await ctx.signIn('contoso.admin@example.com');
    const theirs = (await contoso.get('/api/v1/dashboard').expect(200)).body as {
      issuanceRows: { code: string }[];
      investors: number;
    };
    expect(theirs.issuanceRows.map((row) => row.code)).not.toContain('NWPD1');
    expect(theirs.investors).toBeLessThan(dashboard.investors);
    const investor = await ctx.signIn('investor.a@example.com');
    await investor.get('/api/v1/dashboard').expect(403);
  });
});

describe('the "To do" queue (SPEC §13.5)', () => {
  it('shows each user what waits for its decision, never on what it initiated', async () => {
    // A subscription waiting for review (other test files decide the demo ones).
    const pending = await closedIssuance(ctx, { Baltic: '200' });
    await ctx.admin.query(`UPDATE registry.subscription SET status = 'SUBMITTED' WHERE id = $1`, [
      pending.subscriptions.Baltic,
    ]);
    const operatorTasks = (await operator.get('/api/v1/tasks').expect(200)).body as Task[];
    expect(operatorTasks).toContainEqual(
      expect.objectContaining({
        kind: 'SUBSCRIPTION_TO_REVIEW',
        resourceId: pending.subscriptions.Baltic,
      }),
    );
    // The operator may not approve: no decision of an administrator in its queue.
    expect(operatorTasks.map((row) => row.kind)).not.toContain('SUBSCRIPTION_TO_DECIDE');

    const compliance = await ctx.signIn('northwind.compliance@example.com');
    const complianceTasks = (await compliance.get('/api/v1/tasks').expect(200)).body as Task[];
    // Only what a Compliance Officer may decide.
    for (const row of complianceTasks)
      expect(['KYC_TO_DECIDE', 'TRANSFER_TO_REVIEW', 'CORRECTION_TO_APPROVE']).toContain(row.kind);

    // An allocation proposed by admin 1 waits for admin 2, not for admin 1 (four eyes).
    const notes = await closedIssuance(ctx, { Alpine: '600' });
    const round = (
      await admin1
        .post(`/api/v1/issuances/${notes.issuanceId}/allocation-rounds`)
        .set('Idempotency-Key', randomUUID())
        .expect(201)
    ).body as { id: string };
    await admin1
      .post(`/api/v1/allocations/${round.id}/propose`)
      .set('Idempotency-Key', randomUUID())
      .expect(200);
    const mine = (await admin1.get('/api/v1/tasks').expect(200)).body as Task[];
    const theirs = (await admin2.get('/api/v1/tasks').expect(200)).body as Task[];
    const allocation = (row: Task) =>
      row.kind === 'ALLOCATION_TO_VALIDATE' && row.resourceId === notes.issuanceId;
    expect(mine.some(allocation)).toBe(false);
    expect(theirs.some(allocation)).toBe(true);

    const contoso = await ctx.signIn('contoso.admin@example.com');
    const foreign = (await contoso.get('/api/v1/tasks').expect(200)).body as Task[];
    expect(foreign.some(allocation)).toBe(false);
  });
});

describe('platform indicators (SPEC §18)', () => {
  it('adds up every organisation, for the Platform Administrator only', async () => {
    const platform = await ctx.signIn('platform.admin@example.com');
    const metrics = (await platform.get('/api/v1/platform/metrics').expect(200)).body as {
      organisations: number;
      investors: number;
      ledgerOperations: number;
    };
    expect(metrics.organisations).toBeGreaterThanOrEqual(2);
    expect(metrics.investors).toBe(await count(`SELECT count(*) AS total FROM investor.investor`));
    expect(metrics.ledgerOperations).toBe(
      await count(`SELECT count(*) AS total FROM registry.ledger_entry`),
    );
    await admin1.get('/api/v1/platform/metrics').expect(403);
  });
});

describe("investor's dashboard and positions (SPEC §14.1, §14.3)", () => {
  it('shows the investor its own positions, requests and next payment', async () => {
    const investor = await ctx.signIn('investor.a@example.com');
    const overview = (await investor.get('/api/v1/me/portfolio').expect(200)).body as {
      positionRows: {
        positionId: string;
        code: string;
        quantityHeld: string;
        nominalAmount: string;
      }[];
      nextPayment: { code: string } | null;
      nominalHeld: Record<string, string>;
    };
    const green = overview.positionRows.find((row) => row.code === 'NWGN')!;
    expect(green).toMatchObject({ quantityHeld: '100', nominalAmount: '100000.00' });
    expect(overview.nextPayment).not.toBeNull();

    const detail = (await investor.get(`/api/v1/me/portfolio/${green.positionId}`).expect(200))
      .body as {
      position: { interestRate: string; legalIssuerName: string };
      movements: { type: string; source: { investorName: string | null } }[];
    };
    expect(detail.position).toMatchObject({ interestRate: '0.05' });
    expect(detail.movements.map((row) => row.type).sort()).toEqual([
      'ALLOCATION',
      'BLOCK',
      'UNBLOCK',
    ]);

    const { rows } = await ctx.admin.query<{ id: string }>(
      `SELECT p.id FROM registry.position p JOIN investor.investor i ON i.id = p.investor_id
       WHERE i.legal_name LIKE 'Baltic%' LIMIT 1`,
    );
    await investor.get(`/api/v1/me/portfolio/${rows[0]!.id}`).expect(404);
    // The issuer's staff have no investor dashboard.
    await admin1.get('/api/v1/me/portfolio').expect(404);
  });
});
