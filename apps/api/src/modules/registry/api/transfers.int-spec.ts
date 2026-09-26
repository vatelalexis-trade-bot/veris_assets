// Transfers (phase 13, docs/BACKLOG.md P13-1 to P13-3) and scenario 4 of SPEC §29 through the API.
import { randomUUID } from 'node:crypto';
import type { ErrorResponseBody } from '@virtus/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { QUEUES } from '../../../core/jobs/queues.js';
import type { OutboxJob } from '../../../core/outbox/outbox.js';
import { OutboxRelay } from '../../../core/outbox/outbox-relay.js';
import { startIntegrationApp, type IntegrationApp } from '../../../test/integration-app.js';
import { allocate, closedIssuance, type ClosedIssuance } from '../../../test/registry-fixtures.js';
import { LedgerWriter } from '../application/ledger-writer.js';

type Agent = ReturnType<typeof request.agent>;
let ctx: IntegrationApp;
let operator: Agent;
let admin1: Agent;
let admin2: Agent;
let compliance: Agent;
let alpine: Agent;
let notes: ClosedIssuance;
const errorOf = (response: request.Response) => (response.body as ErrorResponseBody).error;
const key = () => randomUUID();

interface TransferView {
  id: string;
  status: string;
  version: number;
  toInvestorName: string | null;
  toInvestorId: string | null;
}

async function codeOf(name: string): Promise<string> {
  const { rows } = await ctx.admin.query<{ code: string }>(
    `SELECT recipient_code AS code FROM investor.investor WHERE legal_name LIKE $1`,
    [`${name}%`],
  );
  return rows[0]!.code;
}

async function holding(issuanceId: string, investor: string) {
  const { rows } = await ctx.admin.query<{ held: string; blocked: string; acquisition: string }>(
    `SELECT p.quantity_held::int::text AS held, p.quantity_blocked::int::text AS blocked,
       p.acquisition_amount::text AS acquisition
     FROM registry.position p JOIN investor.investor i ON i.id = p.investor_id
     WHERE p.issuance_id = $1 AND i.legal_name LIKE $2`,
    [issuanceId, `${investor}%`],
  );
  return rows[0];
}

async function movements(issuanceId: string): Promise<string[]> {
  const { rows } = await ctx.admin.query<{ type: string }>(
    `SELECT type FROM registry.ledger_entry WHERE issuance_id = $1 ORDER BY sequence_no`,
    [issuanceId],
  );
  return rows.map((row) => row.type);
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

function draft(agent: Agent, body: object) {
  return agent
    .post('/api/v1/transfers')
    .set('Idempotency-Key', key())
    .send({ issuanceId: notes.issuanceId, ...body });
}

function act(agent: Agent, id: string, action: string, body?: object) {
  const call = agent.post(`/api/v1/transfers/${id}/${action}`).set('Idempotency-Key', key());
  return body ? call.send(body) : call;
}

/** A draft of `quantity` units to `recipient`, submitted; returns the answer of the submission. */
async function submitted(recipient: string, quantity: string) {
  const created = (
    await draft(alpine, { recipientCode: await codeOf(recipient), quantity }).expect(201)
  ).body as TransferView;
  return { created, answer: await act(alpine, created.id, 'submit') };
}

beforeAll(async () => {
  ctx = await startIntegrationApp();
  operator = await ctx.signIn('northwind.operator@example.com');
  admin1 = await ctx.signIn('northwind.admin1@example.com');
  admin2 = await ctx.signIn('northwind.admin2@example.com');
  compliance = await ctx.signIn('northwind.compliance@example.com');
  alpine = await ctx.signIn('investor.a@example.com');
  await ctx.admin.query(
    `UPDATE core.outbox_event SET processed_at = now() WHERE processed_at IS NULL`,
  );
  await ctx.admin.query(`DELETE FROM pgboss.job WHERE name = $1`, [QUEUES.outboxEvent.name]);
  // Alpine holds 100 units (paid), Baltic 500; transfers are allowed, without lock-up.
  notes = await closedIssuance(ctx, { Alpine: '100', Baltic: '500' });
  await ctx.admin.query(
    `UPDATE issuance.eligibility_rule_set SET transfers_allowed = true WHERE issuance_id = $1`,
    [notes.issuanceId],
  );
  await allocate(operator, admin2, notes.issuanceId, { Alpine: '100', Baltic: '500' });
  for (const subscription of Object.values(notes.subscriptions)) {
    await operator
      .post(`/api/v1/subscriptions/${subscription}/payment/prepare`)
      .set('Idempotency-Key', key())
      .expect(200);
    await admin1
      .post(`/api/v1/subscriptions/${subscription}/payment/confirm`)
      .set('Idempotency-Key', key())
      .expect(200);
  }
});

afterAll(async () => {
  await ctx.close();
});

describe('scenario 4 — transfer (SPEC §29)', () => {
  let transfer: TransferView;

  it('blocks the units at the submission and sends the request to compliance review', async () => {
    const { created, answer } = await submitted('Cedar', '40');
    expect(answer.status).toBe(200);
    transfer = answer.body as TransferView;
    expect(transfer.status).toBe('COMPLIANCE_REVIEW');
    // The sender never learns who the recipient is (D-010).
    expect(transfer).toMatchObject({ toInvestorName: null, toInvestorId: null });
    expect(await holding(notes.issuanceId, 'Alpine')).toMatchObject({ held: '100', blocked: '40' });
    const history = (await alpine.get(`/api/v1/transfers/${created.id}/transitions`).expect(200))
      .body as { toStatus: string }[];
    expect(history.map((row) => row.toStatus)).toEqual(['DRAFT', 'SUBMITTED', 'COMPLIANCE_REVIEW']);
    await deliverEvents();
    expect(await notified('northwind.compliance@example.com', 'TRANSFER_TO_REVIEW')).toBe(true);
  });

  it('executes the transfer when a Compliance Officer approves: A holds 60, B holds 40', async () => {
    await act(operator, transfer.id, 'approve').expect(403);
    const staffView = (await compliance.get(`/api/v1/transfers/${transfer.id}`).expect(200))
      .body as TransferView;
    expect(staffView.toInvestorName).toMatch(/^Cedar/);

    const approvalKey = key();
    const approved = await compliance
      .post(`/api/v1/transfers/${transfer.id}/approve`)
      .set('Idempotency-Key', approvalKey)
      .expect(200);
    expect((approved.body as TransferView).status).toBe('EXECUTED');
    // Replaying the same request with the same key creates no movement.
    const replay = await compliance
      .post(`/api/v1/transfers/${transfer.id}/approve`)
      .set('Idempotency-Key', approvalKey)
      .expect(200);
    expect(replay.headers['idempotent-replayed']).toBe('true');

    expect((await movements(notes.issuanceId)).slice(-3)).toEqual(['BLOCK', 'UNBLOCK', 'TRANSFER']);
    expect(await holding(notes.issuanceId, 'Alpine')).toEqual({
      held: '60',
      blocked: '0',
      acquisition: '60000.0000',
    });
    expect(await holding(notes.issuanceId, 'Cedar')).toEqual({
      held: '40',
      blocked: '0',
      acquisition: '40000.0000',
    });
    expect(
      await ctx.app.get(LedgerWriter).breachesFor(notes.tenantId, notes.issuanceId, '1000'),
    ).toEqual([]);
    await deliverEvents();
    expect(await notified('investor.a@example.com', 'TRANSFER_EXECUTED')).toBe(true);
    expect(await notified('investor.c@example.com', 'TRANSFER_RECEIVED')).toBe(true);
  });

  it('refuses a request of 70 more units: only 60 are available', async () => {
    const { created, answer } = await submitted('Cedar', '70');
    expect(answer.status).toBe(422);
    expect(errorOf(answer).code).toBe('INSUFFICIENT_AVAILABLE_QUANTITY');
    const after = (await alpine.get(`/api/v1/transfers/${created.id}`).expect(200))
      .body as TransferView;
    expect(after.status).toBe('DRAFT');
    expect(await holding(notes.issuanceId, 'Alpine')).toMatchObject({ held: '60', blocked: '0' });
  });
});

describe('checks of SPEC §11.3 (D-010, D-014)', () => {
  it('refuses an unknown code and the investor’s own code, without saying who is behind', async () => {
    const unknown = await draft(alpine, { recipientCode: 'VA-ZZZZ-ZZZZ', quantity: '1' }).expect(
      422,
    );
    expect(errorOf(unknown).code).toBe('RECIPIENT_CODE_UNKNOWN');
    const own = await draft(alpine, {
      recipientCode: await codeOf('Alpine'),
      quantity: '1',
    }).expect(422);
    expect(errorOf(own).code).toBe('SELF_TRANSFER_FORBIDDEN');
  });

  it('refuses a recipient that is not eligible, without its reasons, and keeps the decision', async () => {
    // Iris's KYC/KYB has expired (demo data).
    const { answer } = await submitted('Iris', '5');
    expect(answer.status).toBe(422);
    expect(errorOf(answer)).toMatchObject({ code: 'RECIPIENT_NOT_ELIGIBLE', details: [] });
    const { rows } = await ctx.admin.query<{ result: string }>(
      `SELECT a.result FROM investor.eligibility_assessment a JOIN investor.investor i ON i.id = a.investor_id
       WHERE i.legal_name LIKE 'Iris%' AND a.context = 'TRANSFER' AND a.issuance_id = $1`,
      [notes.issuanceId],
    );
    expect(rows).toEqual([{ result: 'NOT_ELIGIBLE' }]);
    expect(await holding(notes.issuanceId, 'Alpine')).toMatchObject({ blocked: '0' });
  });

  it('refuses a recipient that would hold more than the maximum per investor', async () => {
    await ctx.admin.query(
      `UPDATE issuance.issuance_terms SET max_amount_per_investor = 520000 WHERE issuance_id = $1`,
      [notes.issuanceId],
    );
    try {
      const { answer } = await submitted('Baltic', '30');
      expect(errorOf(answer).code).toBe('RECIPIENT_NOT_ELIGIBLE');
    } finally {
      await ctx.admin.query(
        `UPDATE issuance.issuance_terms SET max_amount_per_investor = NULL WHERE issuance_id = $1`,
        [notes.issuanceId],
      );
    }
  });

  it('refuses transfers before the lock-up end, or when the issuance does not allow them', async () => {
    await ctx.admin.query(
      `UPDATE issuance.eligibility_rule_set SET lockup_end_date = current_date + 30 WHERE issuance_id = $1`,
      [notes.issuanceId],
    );
    expect(errorOf((await submitted('Cedar', '1')).answer).code).toBe('LOCKUP_PERIOD_ACTIVE');
    await ctx.admin.query(
      `UPDATE issuance.eligibility_rule_set SET lockup_end_date = NULL, transfers_allowed = false
       WHERE issuance_id = $1`,
      [notes.issuanceId],
    );
    expect(errorOf((await submitted('Cedar', '1')).answer).code).toBe('TRANSFER_NOT_ALLOWED');
    await ctx.admin.query(
      `UPDATE issuance.eligibility_rule_set SET transfers_allowed = true WHERE issuance_id = $1`,
      [notes.issuanceId],
    );
  });

  it('needs units: an investor without a position cannot ask', async () => {
    const dora = await ctx.signIn('investor.d@example.com');
    const refused = await dora
      .post('/api/v1/transfers')
      .set('Idempotency-Key', key())
      .send({ issuanceId: notes.issuanceId, recipientCode: await codeOf('Cedar'), quantity: '1' })
      .expect(422);
    expect(errorOf(refused).code).toBe('INSUFFICIENT_AVAILABLE_QUANTITY');
  });
});

describe('decisions and cancellations (P13-2, P13-3)', () => {
  it('gives the units back when the transfer is rejected, and tells the sender why', async () => {
    const { answer } = await submitted('Cedar', '10');
    const pending = answer.body as TransferView;
    await act(compliance, pending.id, 'reject', { reason: '' }).expect(400);
    const rejected = await act(compliance, pending.id, 'reject', {
      reason: 'Recipient documentation incomplete (demo)',
    }).expect(200);
    expect(rejected.body).toMatchObject({ status: 'REJECTED' });
    expect(await holding(notes.issuanceId, 'Alpine')).toMatchObject({ held: '60', blocked: '0' });
    expect((await movements(notes.issuanceId)).at(-1)).toBe('UNBLOCK');
    await deliverEvents();
    expect(await notified('investor.a@example.com', 'TRANSFER_REJECTED')).toBe(true);
  });

  it('lets the investor cancel its request, and the issuer only with a reason', async () => {
    const first = (await submitted('Cedar', '5')).answer.body as TransferView;
    await act(alpine, first.id, 'cancel', {}).expect(200);
    expect(await holding(notes.issuanceId, 'Alpine')).toMatchObject({ blocked: '0' });

    const second = (await submitted('Cedar', '5')).answer.body as TransferView;
    expect(errorOf(await act(admin1, second.id, 'cancel', {}).expect(422)).code).toBe(
      'COMMENT_REQUIRED',
    );
    await act(admin1, second.id, 'cancel', { reason: 'Request withdrawn by phone' }).expect(200);
    expect(await holding(notes.issuanceId, 'Alpine')).toMatchObject({ held: '60', blocked: '0' });
    await deliverEvents();
    expect(await notified('investor.a@example.com', 'TRANSFER_CANCELLED')).toBe(true);
    // A decided request cannot be cancelled.
    await act(alpine, second.id, 'cancel', {}).expect(409);
  });

  it('shows an investor its own requests only', async () => {
    const baltic = await ctx.signIn('investor.b@example.com');
    const own = (await baltic.get('/api/v1/transfers').expect(200)).body as { data: unknown[] };
    expect(own.data).toEqual([]);
    const { rows } = await ctx.admin.query<{ id: string }>(
      `SELECT t.id FROM registry.transfer_request t WHERE t.issuance_id = $1 LIMIT 1`,
      [notes.issuanceId],
    );
    await baltic.get(`/api/v1/transfers/${rows[0]!.id}`).expect(404);
    const all = (
      await compliance.get(`/api/v1/transfers?issuanceId=${notes.issuanceId}`).expect(200)
    ).body as { meta: { total: number } };
    expect(all.meta.total).toBeGreaterThan(3);
  });
});

describe('demo data (SPEC §28)', () => {
  it('has a consistent registry and a transfer waiting for compliance, which can be approved', async () => {
    const { rows } = await ctx.admin.query<{ id: string; tenant_id: string }>(
      `SELECT id, tenant_id FROM issuance.issuance WHERE code = 'NWPD1'`,
    );
    const fund = rows[0]!;
    expect(await ctx.app.get(LedgerWriter).breachesFor(fund.tenant_id, fund.id, '2000')).toEqual(
      [],
    );
    const pending = (
      await compliance
        .get(`/api/v1/transfers?issuanceId=${fund.id}&status=COMPLIANCE_REVIEW`)
        .expect(200)
    ).body as { data: { id: string }[] };
    expect(pending.data).toHaveLength(1);
    await act(compliance, pending.data[0]!.id, 'approve').expect(200);
    expect(await holding(fund.id, 'Danube')).toMatchObject({ held: '100' });
    expect(await ctx.app.get(LedgerWriter).breachesFor(fund.tenant_id, fund.id, '2000')).toEqual(
      [],
    );
  });
});
