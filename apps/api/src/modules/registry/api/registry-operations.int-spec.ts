// Phase 12b (docs/BACKLOG.md P12-4 to P12-9): fictitious payment with four eyes, corrections by
// counter-entry, the daily reconciliation, the token registry abstraction and concurrent writes.
import { randomUUID } from 'node:crypto';
import type { ErrorResponseBody } from '@veris/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { withTenantTransaction, type Database, DATABASE } from '../../../core/database/database.js';
import { AppError } from '../../../core/errors/app-error.js';
import { QUEUES } from '../../../core/jobs/queues.js';
import type { OutboxJob } from '../../../core/outbox/outbox.js';
import { OutboxRelay } from '../../../core/outbox/outbox-relay.js';
import {
  PAYMENT_PROVIDER,
  type PaymentProvider,
} from '../../../core/providers/payment-provider.js';
import {
  TOKEN_REGISTRY_PROVIDER,
  type TokenRegistryProvider,
} from '../../../core/providers/token-registry-provider.js';
import { startIntegrationApp, type IntegrationApp } from '../../../test/integration-app.js';
import { allocate, closedIssuance, type ClosedIssuance } from '../../../test/registry-fixtures.js';
import { LedgerWriter } from '../application/ledger-writer.js';
import { RegistryReconciliation } from '../application/registry-reconciliation.js';

type Agent = ReturnType<typeof request.agent>;
let ctx: IntegrationApp;
let operator: Agent;
let admin1: Agent;
let admin2: Agent;
let compliance: Agent;
let notes: ClosedIssuance;
const errorOf = (response: request.Response) => (response.body as ErrorResponseBody).error;
const key = () => randomUUID();

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

async function holding(issuanceId: string, investor: string) {
  const { rows } = await ctx.admin.query<{ held: string; blocked: string }>(
    `SELECT p.quantity_held::int::text AS held, p.quantity_blocked::int::text AS blocked
     FROM registry.position p JOIN investor.investor i ON i.id = p.investor_id
     WHERE p.issuance_id = $1 AND i.legal_name LIKE $2`,
    [issuanceId, `${investor}%`],
  );
  return rows[0];
}

async function entries(issuanceId: string) {
  const { rows } = await ctx.admin.query<{
    id: string;
    type: string;
    quantity: string;
    reverses_entry_id: string | null;
    source_account_id: string | null;
    destination_account_id: string | null;
  }>(
    `SELECT id, type, quantity::int::text AS quantity, reverses_entry_id, source_account_id,
       destination_account_id
     FROM registry.ledger_entry WHERE issuance_id = $1 ORDER BY sequence_no`,
    [issuanceId],
  );
  return rows;
}

function payment(agent: Agent, subscriptionId: string, action: 'prepare' | 'confirm') {
  return agent
    .post(`/api/v1/subscriptions/${subscriptionId}/payment/${action}`)
    .set('Idempotency-Key', key());
}

beforeAll(async () => {
  ctx = await startIntegrationApp();
  operator = await ctx.signIn('northwind.operator@example.com');
  admin1 = await ctx.signIn('northwind.admin1@example.com');
  admin2 = await ctx.signIn('northwind.admin2@example.com');
  compliance = await ctx.signIn('northwind.compliance@example.com');
  await ctx.admin.query(
    `UPDATE core.outbox_event SET processed_at = now() WHERE processed_at IS NULL`,
  );
  await ctx.admin.query(`DELETE FROM pgboss.job WHERE name = $1`, [QUEUES.outboxEvent.name]);
  notes = await closedIssuance(ctx, { Alpine: '500', Baltic: '400', Cedar: '300' });
  await allocate(operator, admin2, notes.issuanceId, {
    Alpine: '400',
    Baltic: '350',
    Cedar: '250',
  });
});

afterAll(async () => {
  await ctx.close();
});

describe('fictitious payment (SPEC §9.2, §4.8, D-009)', () => {
  it('is prepared by the operator and confirmed by an administrator: the units become available', async () => {
    const alpine = notes.subscriptions.Alpine!;
    const prepared = await payment(operator, alpine, 'prepare').expect(200);
    expect(prepared.body).toMatchObject({
      status: 'PREPARED',
      amount: '400000.00',
      providerReference: expect.stringMatching(/^FAKE-PAY-/),
    });
    await payment(operator, alpine, 'prepare').expect(409);
    await payment(operator, alpine, 'confirm').expect(403);
    await deliverEvents();
    expect(await notified('northwind.admin1@example.com', 'PAYMENT_TO_CONFIRM')).toBe(true);

    const confirmKey = key();
    const confirmed = await admin1
      .post(`/api/v1/subscriptions/${alpine}/payment/confirm`)
      .set('Idempotency-Key', confirmKey)
      .expect(200);
    expect(confirmed.body).toMatchObject({ status: 'CONFIRMED' });
    // Replaying the confirmation writes nothing more.
    const replay = await admin1
      .post(`/api/v1/subscriptions/${alpine}/payment/confirm`)
      .set('Idempotency-Key', confirmKey)
      .expect(200);
    expect(replay.headers['idempotent-replayed']).toBe('true');
    expect((await entries(notes.issuanceId)).filter((row) => row.type === 'UNBLOCK')).toHaveLength(
      1,
    );

    expect(await holding(notes.issuanceId, 'Alpine')).toEqual({ held: '400', blocked: '0' });
    const subscription = await admin1.get(`/api/v1/subscriptions/${alpine}`).expect(200);
    expect((subscription.body as { status: string }).status).toBe('ALLOCATED');
    const history = (await admin1.get(`/api/v1/subscriptions/${alpine}/transitions`).expect(200))
      .body as { toStatus: string }[];
    expect(history.map((row) => row.toStatus).slice(-3)).toEqual([
      'PAYMENT_PENDING',
      'PAYMENT_CONFIRMED',
      'ALLOCATED',
    ]);
    await deliverEvents();
    expect(await notified('investor.a@example.com', 'SUBSCRIPTION_PAYMENT_CONFIRMED')).toBe(true);

    const investor = await ctx.signIn('investor.a@example.com');
    const own = await investor.get(`/api/v1/subscriptions/${alpine}/payment`).expect(200);
    expect(own.body).toMatchObject({ status: 'CONFIRMED' });
  });

  it('is never confirmed by the administrator who prepared it (four eyes)', async () => {
    const baltic = notes.subscriptions.Baltic!;
    await payment(admin1, baltic, 'prepare').expect(200);
    const self = await payment(admin1, baltic, 'confirm').expect(403);
    expect(errorOf(self).code).toBe('FOUR_EYES_VIOLATION');
  });

  it('changes nothing while the provider has not received the payment', async () => {
    const baltic = notes.subscriptions.Baltic!;
    const provider = ctx.app.get<PaymentProvider>(PAYMENT_PROVIDER);
    const spy = vi.spyOn(provider, 'confirm').mockResolvedValueOnce({ received: false });
    const refused = await payment(admin2, baltic, 'confirm').expect(422);
    expect(errorOf(refused).code).toBe('PAYMENT_NOT_RECEIVED');
    spy.mockRestore();
    expect(await holding(notes.issuanceId, 'Baltic')).toEqual({ held: '350', blocked: '350' });
    await payment(admin2, baltic, 'confirm').expect(200);
  });

  it('needs a prepared payment, and fails when the subscription is cancelled', async () => {
    const cedar = notes.subscriptions.Cedar!;
    await payment(admin2, cedar, 'confirm').expect(409);
    await payment(operator, cedar, 'prepare').expect(200);
    await admin1
      .post(`/api/v1/subscriptions/${cedar}/cancel`)
      .set('Idempotency-Key', key())
      .send({ reason: 'Payment never received (demo)' })
      .expect(200);
    const failed = await admin1.get(`/api/v1/subscriptions/${cedar}/payment`).expect(200);
    expect(failed.body).toMatchObject({ status: 'FAILED' });
    await payment(admin2, cedar, 'confirm').expect(409);
    expect(await holding(notes.issuanceId, 'Cedar')).toEqual({ held: '0', blocked: '0' });
  });
});

describe('corrections by counter-entry (SPEC §10.3, P12-7)', () => {
  function propose(agent: Agent, body: object) {
    return agent.post('/api/v1/ledger/corrections').set('Idempotency-Key', key()).send(body);
  }

  it('reverse an entry and write its replacement once another person approves', async () => {
    const all = await entries(notes.issuanceId);
    const balticAllocation = all.find(
      (row) => row.type === 'ALLOCATION' && row.quantity === '350',
    )!;
    const alpineAccount = all.find(
      (row) => row.type === 'ALLOCATION' && row.quantity === '400',
    )!.destination_account_id!;
    const body = {
      targetEntryId: balticAllocation.id,
      reason: 'Units allocated to the wrong investor (demo)',
      replacements: [
        {
          sourceAccountId: balticAllocation.source_account_id,
          destinationAccountId: alpineAccount,
          quantity: '350',
        },
      ],
    };
    await propose(operator, body).expect(403);
    const proposed = await propose(admin1, body).expect(201);
    const correction = proposed.body as { id: string; status: string };
    expect(correction.status).toBe('PROPOSED');
    // One request at a time for an entry.
    expect(errorOf(await propose(admin1, body).expect(409)).details[0]).toMatchObject({
      code: 'CORRECTION_PENDING',
    });
    await deliverEvents();
    expect(await notified('northwind.compliance@example.com', 'CORRECTION_TO_APPROVE')).toBe(true);

    const self = await admin1
      .post(`/api/v1/ledger/corrections/${correction.id}/approve`)
      .set('Idempotency-Key', key())
      .send({})
      .expect(403);
    expect(errorOf(self).code).toBe('FOUR_EYES_VIOLATION');
    await compliance
      .post(`/api/v1/ledger/corrections/${correction.id}/approve`)
      .set('Idempotency-Key', key())
      .send({ comment: 'Checked against the subscription forms' })
      .expect(200);

    const after = await entries(notes.issuanceId);
    const corrections = after.filter((row) => row.type === 'CORRECTION');
    expect(corrections).toEqual([
      expect.objectContaining({ quantity: '350', reverses_entry_id: balticAllocation.id }),
      expect.objectContaining({ quantity: '350', reverses_entry_id: null }),
    ]);
    // The original entry is untouched; the positions follow the corrections.
    expect(after.find((row) => row.id === balticAllocation.id)).toEqual(balticAllocation);
    expect(await holding(notes.issuanceId, 'Baltic')).toEqual({ held: '0', blocked: '0' });
    expect(await holding(notes.issuanceId, 'Alpine')).toEqual({ held: '750', blocked: '0' });
    expect(
      await ctx.app.get(LedgerWriter).breachesFor(notes.tenantId, notes.issuanceId, '1000'),
    ).toEqual([]);

    const again = await propose(admin1, { ...body, replacements: [] }).expect(409);
    expect(errorOf(again).details[0]).toMatchObject({ code: 'ALREADY_CORRECTED' });
    await deliverEvents();
    expect(await notified('northwind.admin1@example.com', 'CORRECTION_APPROVED')).toBe(true);
  });

  it('refuse blocking movements, and a correction that would take units not available', async () => {
    const all = await entries(notes.issuanceId);
    const block = all.find((row) => row.type === 'BLOCK')!;
    const refused = await propose(admin1, { targetEntryId: block.id, reason: 'Probe' }).expect(400);
    expect(errorOf(refused).details[0]).toMatchObject({
      code: 'CORRECTION_NOT_SUPPORTED_FOR_TYPE',
    });

    // Reversing the creation of the 1 000 units would take them from an almost empty treasury.
    const issuanceEntry = all.find((row) => row.type === 'ISSUANCE')!;
    const proposed = (
      await propose(admin1, { targetEntryId: issuanceEntry.id, reason: 'Probe' }).expect(201)
    ).body as { id: string };
    const count = all.length;
    const impossible = await admin2
      .post(`/api/v1/ledger/corrections/${proposed.id}/approve`)
      .set('Idempotency-Key', key())
      .send({})
      .expect(422);
    expect(errorOf(impossible).code).toBe('INSUFFICIENT_AVAILABLE_QUANTITY');
    expect(await entries(notes.issuanceId)).toHaveLength(count);

    await admin2
      .post(`/api/v1/ledger/corrections/${proposed.id}/reject`)
      .set('Idempotency-Key', key())
      .send({ comment: 'Not possible: units are held by investors' })
      .expect(200);
    const listed = (
      await compliance.get(`/api/v1/ledger/corrections?issuanceId=${notes.issuanceId}`).expect(200)
    ).body as { status: string }[];
    expect(listed.map((row) => row.status).sort()).toEqual(['APPROVED', 'REJECTED']);
  });
});

describe('reconciliation (SPEC §10.4, P12-5)', () => {
  it('reports a consistent registry on demand, to the issuer only', async () => {
    const result = await compliance
      .get(`/api/v1/ledger/reconciliation?issuanceId=${notes.issuanceId}`)
      .expect(200);
    expect(result.body).toMatchObject({ consistent: true, breaches: [] });
    expect((result.body as { entries: number }).entries).toBeGreaterThan(7);
    const investor = await ctx.signIn('investor.a@example.com');
    await investor.get(`/api/v1/ledger/reconciliation?issuanceId=${notes.issuanceId}`).expect(404);
  });

  it('finds a position changed behind the ledger, audits it and warns the issuer', async () => {
    const { rows } = await ctx.admin.query<{ id: string }>(
      `SELECT id FROM registry.position WHERE issuance_id = $1 AND investor_id IS NULL`,
      [notes.issuanceId],
    );
    const treasury = rows[0]!.id;
    await ctx.admin.query(
      `UPDATE registry.position SET quantity_held = quantity_held + 5 WHERE id = $1`,
      [treasury],
    );
    try {
      const anomalies = await ctx.app.get(RegistryReconciliation).run();
      expect(anomalies.find((row) => row.issuanceId === notes.issuanceId)?.breaches).toEqual([
        expect.objectContaining({ invariant: 2, detail: 'POSITION_DIFFERS_FROM_LEDGER' }),
      ]);
      const audit = await ctx.admin.query(
        `SELECT 1 FROM audit.audit_event WHERE action = 'REGISTRY_RECONCILIATION_FAILED' AND resource_id = $1`,
        [notes.issuanceId],
      );
      expect(audit.rowCount).toBe(1);
      await deliverEvents();
      expect(await notified('northwind.compliance@example.com', 'REGISTRY_ANOMALY')).toBe(true);
    } finally {
      await ctx.admin.query(
        `UPDATE registry.position SET quantity_held = quantity_held - 5 WHERE id = $1`,
        [treasury],
      );
    }
  });
});

describe('token registry and concurrent writes (SPEC §26, P12-4, P12-6)', () => {
  let scope: { tenantId: string; issuanceId: string };
  let treasury: string;
  let alpine: string;
  let baltic: string;
  const provider = () => ctx.app.get<TokenRegistryProvider>(TOKEN_REGISTRY_PROVIDER);

  beforeAll(async () => {
    const fresh = await closedIssuance(ctx, {});
    scope = { tenantId: fresh.tenantId, issuanceId: fresh.issuanceId };
    treasury = (await provider().createAsset(scope, 'EUR')).treasuryAccountId;
    const investorAccount = async (name: string) => {
      const { rows } = await ctx.admin.query<{ id: string }>(
        `SELECT id FROM investor.investor WHERE legal_name LIKE $1`,
        [`${name}%`],
      );
      return withTenantTransaction(ctx.app.get<Database>(DATABASE), scope.tenantId, (tx) =>
        ctx.app.get(LedgerWriter).account(tx, scope.tenantId, scope.issuanceId, rows[0]!.id, 'EUR'),
      );
    };
    alpine = await investorAccount('Alpine');
    baltic = await investorAccount('Baltic');
  });

  it('mints, transfers, freezes, burns and reports balances through the internal ledger', async () => {
    const minted = await provider().mint(scope, treasury, '1000', 'test:mint');
    expect(await provider().getTransactionStatus(scope, minted.transactionId)).toBe('POSTED');
    expect(await provider().getTransactionStatus(scope, randomUUID())).toBe('UNKNOWN');
    await provider().transfer(scope, treasury, alpine, '100', 'test:transfer');
    await provider().freeze(scope, alpine, '40', 'test:freeze');
    expect(await provider().getBalance(scope, alpine)).toEqual({
      held: '100',
      blocked: '40',
      available: '60',
    });
    await expect(provider().burn(scope, alpine, '61', 'test:burn')).rejects.toMatchObject({
      code: 'INSUFFICIENT_AVAILABLE_QUANTITY',
    });
    await provider().unfreeze(scope, alpine, '40', 'test:unfreeze');
    await provider().burn(scope, treasury, '100', 'test:burn');
    expect(await provider().getBalance(scope, treasury)).toMatchObject({ held: '800' });
  });

  it('serialises simultaneous blocks of one position: never more than available', async () => {
    // Alpine has 100 available units: five simultaneous blocks of 30 units each.
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, (_, index) =>
        provider().freeze(scope, alpine, '30', `test:concurrent-freeze-${index}`),
      ),
    );
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(3);
    const refusals = results.filter((result) => result.status === 'rejected');
    expect(refusals).toHaveLength(2);
    for (const refusal of refusals) expect(refusal.reason).toBeInstanceOf(AppError);
    expect(await provider().getBalance(scope, alpine)).toEqual({
      held: '100',
      blocked: '90',
      available: '10',
    });
  });

  it('keeps the sequence and the hash chain intact under simultaneous transfers', async () => {
    // The treasury holds 800 units: twelve simultaneous transfers of 100 units to Baltic.
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, (_, index) =>
        provider().transfer(scope, treasury, baltic, '100', `test:concurrent-transfer-${index}`),
      ),
    );
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(8);
    expect(await provider().getBalance(scope, baltic)).toMatchObject({ held: '800' });
    expect(await provider().getBalance(scope, treasury)).toMatchObject({ held: '0' });
    const { rows } = await ctx.admin.query<{ sequence_no: string }>(
      `SELECT sequence_no FROM registry.ledger_entry WHERE issuance_id = $1 ORDER BY sequence_no`,
      [scope.issuanceId],
    );
    expect(rows.map((row) => Number.parseInt(row.sequence_no, 10))).toEqual(
      Array.from({ length: rows.length }, (_, index) => index + 1),
    );
    expect(
      await ctx.app.get(LedgerWriter).breachesFor(scope.tenantId, scope.issuanceId, '1000'),
    ).toEqual([]);
  });

  it('confirms a payment once when two administrators confirm it at the same time', async () => {
    const other = await closedIssuance(ctx, { Alpine: '600' });
    await allocate(operator, admin2, other.issuanceId, { Alpine: '600' });
    const subscription = other.subscriptions.Alpine!;
    await payment(operator, subscription, 'prepare').expect(200);
    const [first, second] = await Promise.all([
      payment(admin1, subscription, 'confirm'),
      payment(admin2, subscription, 'confirm'),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 409]);
    expect((await entries(other.issuanceId)).filter((row) => row.type === 'UNBLOCK')).toHaveLength(
      1,
    );
  });
});

describe('reading the registry', () => {
  it('shows the history of an allocation round, never to investors', async () => {
    const rounds = (
      await admin1.get(`/api/v1/issuances/${notes.issuanceId}/allocation-rounds`).expect(200)
    ).body as { id: string }[];
    const history = (
      await admin1.get(`/api/v1/allocations/${rounds[0]!.id}/transitions`).expect(200)
    ).body as { toStatus: string; actorName: string | null }[];
    expect(history.map((row) => row.toStatus)).toEqual(['DRAFT', 'PROPOSED', 'VALIDATED']);
    expect(history.every((row) => row.actorName !== null)).toBe(true);
    const investor = await ctx.signIn('investor.a@example.com');
    await investor.get(`/api/v1/allocations/${rounds[0]!.id}`).expect(404);
    await investor.get(`/api/v1/ledger/corrections?issuanceId=${notes.issuanceId}`).expect(200, []);
  });

  it('shows a movement to the issuer, and to an investor only when it touches its account', async () => {
    const all = await entries(notes.issuanceId);
    const issuanceEntry = all.find((row) => row.type === 'ISSUANCE')!;
    const staff = await operator.get(`/api/v1/ledger/${issuanceEntry.id}`).expect(200);
    expect(staff.body).toMatchObject({
      type: 'ISSUANCE',
      destination: { type: 'ISSUER_TREASURY' },
    });
    const investor = await ctx.signIn('investor.a@example.com');
    await investor.get(`/api/v1/ledger/${issuanceEntry.id}`).expect(404);
    const allocation = all.find((row) => row.type === 'ALLOCATION' && row.quantity === '400')!;
    const own = await investor.get(`/api/v1/ledger/${allocation.id}`).expect(200);
    expect(own.body).toMatchObject({
      source: { type: 'ISSUER_TREASURY', investorName: null },
      destination: { investorName: expect.stringMatching(/^Alpine/) },
    });
    const filtered = (
      await operator
        .get(`/api/v1/ledger?issuanceId=${notes.issuanceId}&type=CORRECTION`)
        .expect(200)
    ).body as { data: { type: string }[] };
    expect(filtered.data.map((row) => row.type)).toEqual(['CORRECTION', 'CORRECTION']);
  });

  it('filters positions by investor, and hides other investors’ positions', async () => {
    const { rows } = await ctx.admin.query<{ investor_id: string; id: string }>(
      `SELECT p.investor_id, p.id FROM registry.position p JOIN investor.investor i ON i.id = p.investor_id
       WHERE p.issuance_id = $1 AND i.legal_name LIKE 'Baltic%'`,
      [notes.issuanceId],
    );
    const byInvestor = (
      await operator
        .get(`/api/v1/positions?issuanceId=${notes.issuanceId}&investorId=${rows[0]!.investor_id}`)
        .expect(200)
    ).body as { data: { id: string }[] };
    expect(byInvestor.data.map((row) => row.id)).toEqual([rows[0]!.id]);
    await operator.get(`/api/v1/positions/${rows[0]!.id}`).expect(200);
    const investor = await ctx.signIn('investor.a@example.com');
    await investor.get(`/api/v1/positions/${rows[0]!.id}`).expect(404);
  });
});
