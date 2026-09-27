// Allocation and registry (phase 12a, docs/BACKLOG.md P12-1 to P12-3): manual allocation with four
// eyes, the registry entries of D-009 in one transaction, scenario 3 of SPEC §29 through the API,
// and the append-only ledger enforced by the database.
import { randomUUID } from 'node:crypto';
import type { ErrorResponseBody } from '@veris/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { QUEUES } from '../../../core/jobs/queues.js';
import type { OutboxJob } from '../../../core/outbox/outbox.js';
import { OutboxRelay } from '../../../core/outbox/outbox-relay.js';
import { generatedDocuments } from '../../../test/generated-documents.js';
import { startIntegrationApp, type IntegrationApp } from '../../../test/integration-app.js';
import { LedgerWriter } from '../application/ledger-writer.js';

type Agent = ReturnType<typeof request.agent>;
let ctx: IntegrationApp;
let operator: Agent;
let admin1: Agent;
let admin2: Agent;
let notesId: string;
const errorOf = (response: request.Response) => (response.body as ErrorResponseBody).error;
const key = () => randomUUID();

interface RoundView {
  id: string;
  status: string;
  version: number;
  lines: { subscriptionId: string; investorName: string; allocatedUnits: string }[];
  totals: { requestedUnits: string; allocatedUnits: string; allocatedAmount: string };
  failures: { code: string }[];
}

async function idOf(query: string, values: unknown[] = []): Promise<string> {
  return (await ctx.admin.query<{ id: string }>(query, values)).rows[0]!.id;
}

async function deliverEvents(): Promise<void> {
  const relay = ctx.app.get(OutboxRelay);
  const { rows } = await ctx.admin.query<{ data: OutboxJob }>(
    `SELECT data FROM pgboss.job WHERE name = $1 AND state = 'created'`,
    [QUEUES.outboxEvent.name],
  );
  for (const row of rows) await relay.deliver(row.data);
  await ctx.admin.query(`DELETE FROM pgboss.job WHERE name = $1`, [QUEUES.outboxEvent.name]);
}

async function notified(email: string, type: string): Promise<boolean> {
  const { rowCount } = await ctx.admin.query(
    `SELECT 1 FROM core.notification n JOIN iam.user u ON u.id = n.user_id WHERE u.email = $1 AND n.title_key = $2`,
    [email, type],
  );
  return (rowCount ?? 0) > 0;
}

/** Units per investor name prefix: Alpine 500, Baltic 400, Cedar 300 were requested. */
function linesFor(round: RoundView, units: Record<string, string>) {
  return round.lines.map((line) => ({
    subscriptionId: line.subscriptionId,
    allocatedUnits: units[line.investorName.split(' ')[0]!]!,
  }));
}

function patch(agent: Agent, round: RoundView, body: object) {
  return agent
    .patch(`/api/v1/allocations/${round.id}`)
    .set('If-Match', `"${round.version}"`)
    .send(body);
}

function act(agent: Agent, round: RoundView, action: string, body?: object) {
  const call = agent
    .post(`/api/v1/allocations/${round.id}/${action}`)
    .set('Idempotency-Key', key());
  return body ? call.send(body) : call;
}

async function ledgerCount(issuanceId: string): Promise<number> {
  const { rows } = await ctx.admin.query<{ count: string }>(
    `SELECT count(*) FROM registry.ledger_entry WHERE issuance_id = $1`,
    [issuanceId],
  );
  return Number.parseInt(rows[0]!.count, 10);
}

beforeAll(async () => {
  ctx = await startIntegrationApp();
  operator = await ctx.signIn('northwind.operator@example.com');
  admin1 = await ctx.signIn('northwind.admin1@example.com');
  admin2 = await ctx.signIn('northwind.admin2@example.com');
  notesId = await idOf(`SELECT id FROM issuance.issuance WHERE code = 'NWIN26'`);
  await ctx.admin.query(
    `UPDATE core.outbox_event SET processed_at = now() WHERE processed_at IS NULL`,
  );
  await ctx.admin.query(`DELETE FROM pgboss.job WHERE name = $1`, [QUEUES.outboxEvent.name]);
});

afterAll(async () => {
  await ctx.close();
});

describe('allocation rounds: preconditions', () => {
  it('needs closed subscriptions, every one of them decided', async () => {
    const debt = await idOf(`SELECT id FROM issuance.issuance WHERE code = 'NWSD26'`);
    // Other test files may have closed or cancelled it.
    await ctx.admin.query(
      `UPDATE issuance.issuance SET status = 'SUBSCRIPTION_OPEN' WHERE id = $1`,
      [debt],
    );
    const open = await operator
      .post(`/api/v1/issuances/${debt}/allocation-rounds`)
      .set('Idempotency-Key', key())
      .expect(409);
    expect(errorOf(open).code).toBe('INVALID_STATE_TRANSITION');
    // A subscription still waits for review.
    const pending = await idOf(
      `INSERT INTO registry.subscription (tenant_id, issuance_id, investor_id, status,
         requested_units, requested_amount, currency)
       SELECT d.tenant_id, d.id, i.id, 'SUBMITTED', 100, 100000, 'EUR'
       FROM issuance.issuance d, investor.investor i
       WHERE d.id = $1 AND i.legal_name LIKE 'Danube%' RETURNING id`,
      [debt],
    );
    await ctx.admin.query(
      `UPDATE issuance.issuance SET status = 'SUBSCRIPTION_CLOSED' WHERE id = $1`,
      [debt],
    );
    try {
      const undecided = await operator
        .post(`/api/v1/issuances/${debt}/allocation-rounds`)
        .set('Idempotency-Key', key())
        .expect(422);
      expect(errorOf(undecided).code).toBe('SUBSCRIPTIONS_TO_DECIDE');
    } finally {
      await ctx.admin.query(
        `UPDATE issuance.issuance SET status = 'SUBSCRIPTION_OPEN' WHERE id = $1`,
        [debt],
      );
      await ctx.admin.query(`DELETE FROM registry.subscription WHERE id = $1`, [pending]);
    }
  });

  it('is not shown to investors, and not reachable by them', async () => {
    const investor = await ctx.signIn('investor.a@example.com');
    const seen = await investor.get(`/api/v1/issuances/${notesId}/allocation-rounds`).expect(200);
    expect(seen.body).toEqual([]);
    await investor
      .post(`/api/v1/issuances/${notesId}/allocation-rounds`)
      .set('Idempotency-Key', key())
      .expect(403);
  });
});

describe('scenario 3 — allocation (SPEC §29)', () => {
  let round: RoundView;

  it('prepares a round prefilled with the approved requests (1 200 units for 1 000)', async () => {
    const created = await operator
      .post(`/api/v1/issuances/${notesId}/allocation-rounds`)
      .set('Idempotency-Key', key())
      .expect(201);
    round = created.body as RoundView;
    expect(round).toMatchObject({
      status: 'DRAFT',
      totals: { requestedUnits: '1200', allocatedUnits: '1200' },
    });
    expect(round.lines.map((line) => line.allocatedUnits)).toEqual(['500', '400', '300']);
    expect(round.failures.map((failure) => failure.code)).toEqual(['ALLOCATION_EXCEEDS_SUPPLY']);
    // Only one round at a time.
    const second = await operator
      .post(`/api/v1/issuances/${notesId}/allocation-rounds`)
      .set('Idempotency-Key', key())
      .expect(409);
    expect(errorOf(second).details[0]).toMatchObject({ code: 'ALLOCATION_ROUND_IN_PROGRESS' });
  });

  it('keeps the approved subscriptions while a round is prepared', async () => {
    const approved = await idOf(
      `SELECT id FROM registry.subscription WHERE issuance_id = $1 AND status = 'APPROVED' LIMIT 1`,
      [notesId],
    );
    const refused = await admin1
      .post(`/api/v1/subscriptions/${approved}/cancel`)
      .set('Idempotency-Key', key())
      .send({ reason: 'Probe' })
      .expect(409);
    expect(errorOf(refused).details[0]).toMatchObject({ code: 'ALLOCATION_ROUND_IN_PROGRESS' });
  });

  it('is rejected by an administrator with a comment, and the preparer is told', async () => {
    round = (
      await patch(operator, round, {
        lines: linesFor(round, { Alpine: '400', Baltic: '350', Cedar: '250' }),
      }).expect(200)
    ).body as RoundView;
    await act(operator, round, 'propose').expect(200);
    await act(admin1, round, 'reject', {}).expect(400);
    const rejected = await act(admin1, round, 'reject', {
      comment: 'Favour long-term investors',
    }).expect(200);
    expect((rejected.body as RoundView).status).toBe('REJECTED');
    await deliverEvents();
    expect(await notified('northwind.operator@example.com', 'ALLOCATION_REJECTED')).toBe(true);
    expect(await ledgerCount(notesId)).toBe(0);
  });

  it('refuses a round above the supply (1 001 units) or below the minimum without justification', async () => {
    round = (
      await admin1
        .post(`/api/v1/issuances/${notesId}/allocation-rounds`)
        .set('Idempotency-Key', key())
        .expect(201)
    ).body as RoundView;
    round = (
      await patch(admin1, round, {
        lines: linesFor(round, { Alpine: '100', Baltic: '100', Cedar: '100' }),
      }).expect(200)
    ).body as RoundView;
    const small = await act(admin1, round, 'propose').expect(422);
    expect(errorOf(small).code).toBe('MINIMUM_NOT_REACHED_JUSTIFICATION_REQUIRED');

    round = (
      await patch(admin1, round, {
        lines: linesFor(round, { Alpine: '400', Baltic: '350', Cedar: '251' }),
      }).expect(200)
    ).body as RoundView;
    const over = await act(admin1, round, 'propose').expect(422);
    expect(errorOf(over)).toMatchObject({
      code: 'ALLOCATION_EXCEEDS_SUPPLY',
      details: [expect.objectContaining({ meta: { totalUnits: '1000', allocatedUnits: '1001' } })],
    });
    const tooMuch = await patch(admin1, round, {
      lines: linesFor(round, { Alpine: '501', Baltic: '350', Cedar: '100' }),
    }).expect(200);
    expect((tooMuch.body as RoundView).failures.map((failure) => failure.code)).toContain(
      'ALLOCATION_EXCEEDS_REQUEST',
    );
    round = tooMuch.body as RoundView;
    // A stale version is refused.
    await admin1
      .patch(`/api/v1/allocations/${round.id}`)
      .set('If-Match', '"1"')
      .send({ lines: [] })
      .expect(409);
  });

  it('is validated by another administrator only (four eyes)', async () => {
    round = (
      await patch(admin1, round, {
        lines: linesFor(round, { Alpine: '400', Baltic: '350', Cedar: '250' }),
      }).expect(200)
    ).body as RoundView;
    expect(round.totals).toMatchObject({ allocatedUnits: '1000', allocatedAmount: '1000000.00' });
    await act(admin1, round, 'propose').expect(200);
    await deliverEvents();
    expect(await notified('northwind.admin2@example.com', 'ALLOCATION_TO_VALIDATE')).toBe(true);

    await act(operator, round, 'validate').expect(403);
    const self = await act(admin1, round, 'validate').expect(403);
    expect(errorOf(self).code).toBe('FOUR_EYES_VIOLATION');
  });

  it('creates the positions and the movements in one transaction; the sum of positions is 1 000', async () => {
    const validationKey = key();
    const validated = await admin2
      .post(`/api/v1/allocations/${round.id}/validate`)
      .set('Idempotency-Key', validationKey)
      .expect(200);
    expect((validated.body as RoundView).status).toBe('VALIDATED');

    // Replaying the validation with the same key creates nothing more.
    const entries = await ledgerCount(notesId);
    expect(entries).toBe(7);
    const replay = await admin2
      .post(`/api/v1/allocations/${round.id}/validate`)
      .set('Idempotency-Key', validationKey)
      .expect(200);
    expect(replay.headers['idempotent-replayed']).toBe('true');
    expect(await ledgerCount(notesId)).toBe(7);

    const { rows: movements } = await ctx.admin.query<{ type: string; quantity: string }>(
      `SELECT type, quantity::text FROM registry.ledger_entry WHERE issuance_id = $1 ORDER BY sequence_no`,
      [notesId],
    );
    expect(movements.map((row) => `${row.type} ${Number.parseInt(row.quantity, 10)}`)).toEqual([
      'ISSUANCE 1000',
      'ALLOCATION 400',
      'BLOCK 400',
      'ALLOCATION 350',
      'BLOCK 350',
      'ALLOCATION 250',
      'BLOCK 250',
    ]);

    const positions = (await operator.get(`/api/v1/positions?issuanceId=${notesId}`).expect(200))
      .body as {
      data: {
        accountType: string;
        investorName: string | null;
        quantityHeld: string;
        quantityBlocked: string;
        quantityAvailable: string;
        acquisitionAmount: string;
      }[];
    };
    const investors = positions.data.filter((row) => row.accountType === 'INVESTOR');
    expect(investors.map((row) => row.quantityHeld).sort()).toEqual(['250', '350', '400']);
    expect(investors.every((row) => row.quantityBlocked === row.quantityHeld)).toBe(true);
    expect(investors.every((row) => row.quantityAvailable === '0')).toBe(true);
    const treasury = positions.data.find((row) => row.accountType === 'ISSUER_TREASURY')!;
    expect(treasury.quantityHeld).toBe('0');
    expect(investors.find((row) => row.investorName?.startsWith('Alpine'))?.acquisitionAmount).toBe(
      '400000.00',
    );

    // Subscriptions wait for payment, the issuance is allocated, and the registry is consistent.
    const { rows: subscriptions } = await ctx.admin.query<{
      status: string;
      allocated_units: string;
      amount_due: string;
    }>(
      `SELECT status, allocated_units::int::text, amount_due::text FROM registry.subscription
       WHERE issuance_id = $1 ORDER BY submitted_at`,
      [notesId],
    );
    expect(subscriptions).toEqual([
      { status: 'PAYMENT_PENDING', allocated_units: '400', amount_due: '400000.0000' },
      { status: 'PAYMENT_PENDING', allocated_units: '350', amount_due: '350000.0000' },
      { status: 'PAYMENT_PENDING', allocated_units: '250', amount_due: '250000.0000' },
    ]);
    const issuance = await operator.get(`/api/v1/issuances/${notesId}`).expect(200);
    expect((issuance.body as { status: string }).status).toBe('ALLOCATED');
    const { rows: audit } = await ctx.admin.query<{ action: string }>(
      `SELECT action FROM audit.audit_event WHERE resource_id = $1`,
      [round.id],
    );
    expect(audit.map((row) => row.action)).toEqual(
      expect.arrayContaining(['ALLOCATION_ROUND_PROPOSED', 'ALLOCATION_ROUND_VALIDATED']),
    );

    await deliverEvents();
    expect(await notified('investor.a@example.com', 'SUBSCRIPTION_ALLOCATED')).toBe(true);
    // Each allocated investor gets its allocation confirmation (P15-9).
    const confirmations = await generatedDocuments(
      ctx,
      'ALLOCATION_CONFIRMATION',
      'investor.a@example.com',
      notesId,
    );
    expect(confirmations).toEqual([
      expect.objectContaining({ confidentiality: 'INVESTOR_VISIBLE', header: '%PDF-' }),
    ]);
  });

  it('shows an investor its own position and movements only', async () => {
    const investor = await ctx.signIn('investor.b@example.com');
    const own = (await investor.get(`/api/v1/positions?issuanceId=${notesId}`).expect(200))
      .body as {
      data: { investorName: string; quantityHeld: string }[];
    };
    expect(own.data).toEqual([
      expect.objectContaining({
        investorName: expect.stringMatching(/^Baltic/),
        quantityHeld: '350',
      }),
    ]);
    const movements = (await investor.get(`/api/v1/ledger?issuanceId=${notesId}`).expect(200))
      .body as { data: { type: string; destination: { investorName: string | null } }[] };
    expect(movements.data.map((row) => row.type).sort()).toEqual(['ALLOCATION', 'BLOCK']);
    const alpinePosition = await idOf(
      `SELECT p.id FROM registry.position p JOIN investor.investor i ON i.id = p.investor_id
       WHERE i.legal_name LIKE 'Alpine%'`,
    );
    await investor.get(`/api/v1/positions/${alpinePosition}`).expect(404);
  });

  it('gives the units back to the treasury when a pending payment is cancelled (D-009)', async () => {
    const cedar = await idOf(
      `SELECT s.id FROM registry.subscription s JOIN investor.investor i ON i.id = s.investor_id
       WHERE s.issuance_id = $1 AND i.legal_name LIKE 'Cedar%'`,
      [notesId],
    );
    const investor = await ctx.signIn('investor.c@example.com');
    await investor
      .post(`/api/v1/subscriptions/${cedar}/cancel`)
      .set('Idempotency-Key', key())
      .send({})
      .expect(409);
    await admin1
      .post(`/api/v1/subscriptions/${cedar}/cancel`)
      .set('Idempotency-Key', key())
      .send({ reason: 'Payment never received (demo)' })
      .expect(200);
    const { rows } = await ctx.admin.query<{ type: string }>(
      `SELECT type FROM registry.ledger_entry WHERE issuance_id = $1 ORDER BY sequence_no DESC LIMIT 2`,
      [notesId],
    );
    expect(rows.map((row) => row.type)).toEqual(['CANCELLATION', 'UNBLOCK']);
    const { rows: holdings } = await ctx.admin.query<{ type: string; held: string }>(
      `SELECT a.type, p.quantity_held::int::text AS held FROM registry.position p
       JOIN registry.logical_account a ON a.id = p.account_id
       LEFT JOIN investor.investor i ON i.id = p.investor_id
       WHERE p.issuance_id = $1 AND (a.type = 'ISSUER_TREASURY' OR i.legal_name LIKE 'Cedar%')
       ORDER BY a.type`,
      [notesId],
    );
    expect(holdings).toEqual([
      { type: 'INVESTOR', held: '0' },
      { type: 'ISSUER_TREASURY', held: '250' },
    ]);
  });
});

describe('registry integrity (SPEC §10.4)', () => {
  it('meets the invariants after the allocation and the cancellation', async () => {
    const tenantId = await idOf(`SELECT tenant_id AS id FROM issuance.issuance WHERE id = $1`, [
      notesId,
    ]);
    expect(await ctx.app.get(LedgerWriter).breachesFor(tenantId, notesId, '1000')).toEqual([]);
  });

  it('detects a position changed behind the ledger’s back (invariant 2)', async () => {
    const { rows } = await ctx.admin.query<{ tenant_id: string; id: string }>(
      `SELECT tenant_id, id FROM registry.position WHERE issuance_id = $1 AND investor_id IS NULL`,
      [notesId],
    );
    await ctx.admin.query(
      `UPDATE registry.position SET quantity_held = quantity_held + 1 WHERE id = $1`,
      [rows[0]!.id],
    );
    try {
      const found = await ctx.app
        .get(LedgerWriter)
        .breachesFor(rows[0]!.tenant_id, notesId, '1000');
      expect(found).toEqual([
        expect.objectContaining({ invariant: 2, detail: 'POSITION_DIFFERS_FROM_LEDGER' }),
      ]);
    } finally {
      await ctx.admin.query(
        `UPDATE registry.position SET quantity_held = quantity_held - 1 WHERE id = $1`,
        [rows[0]!.id],
      );
    }
  });

  it('refuses any change or deletion of a movement, whatever the role (invariant 4)', async () => {
    await expect(
      ctx.admin.query(`UPDATE registry.ledger_entry SET quantity = 1 WHERE issuance_id = $1`, [
        notesId,
      ]),
    ).rejects.toThrow(/append-only/);
    await expect(
      ctx.admin.query(`DELETE FROM registry.ledger_entry WHERE issuance_id = $1`, [notesId]),
    ).rejects.toThrow(/append-only/);
    const { rows } = await ctx.admin.query<{ allowed: boolean }>(
      `SELECT has_table_privilege('va_app', 'registry.ledger_entry', 'UPDATE')
           OR has_table_privilege('va_app', 'registry.ledger_entry', 'DELETE') AS allowed`,
    );
    expect(rows[0]!.allowed).toBe(false);
  });
});
