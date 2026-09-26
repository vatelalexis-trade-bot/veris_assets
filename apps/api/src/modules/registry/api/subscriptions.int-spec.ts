// Subscriptions (phase 11, docs/BACKLOG.md P11-1 to P11-3, P11-6): the complete subscription, the
// checks of SPEC §9.3 and scenario 2 of SPEC §29 (investor not eligible).
import { randomUUID } from 'node:crypto';
import type { ErrorResponseBody } from '@virtus/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { QUEUES } from '../../../core/jobs/queues.js';
import type { OutboxJob } from '../../../core/outbox/outbox.js';
import { OutboxRelay } from '../../../core/outbox/outbox-relay.js';
import { startIntegrationApp, type IntegrationApp } from '../../../test/integration-app.js';

type Agent = ReturnType<typeof request.agent>;
let ctx: IntegrationApp;
let operator: Agent;
let admin: Agent;
let debtId: string;
const errorOf = (response: request.Response) => (response.body as ErrorResponseBody).error;
const key = () => randomUUID();

interface SubscriptionView {
  id: string;
  status: string;
  requestedAmount: string;
  eligibilityAssessmentId: string | null;
  rejectionReason: string | null;
  cancellationReason: string | null;
}

async function idOf(query: string, values: unknown[] = []): Promise<string> {
  return (await ctx.admin.query<{ id: string }>(query, values)).rows[0]!.id;
}

async function draft(
  agent: Agent,
  units: string,
  amount = `${units}000.00`,
): Promise<SubscriptionView> {
  return (
    await agent
      .post('/api/v1/subscriptions')
      .set('Idempotency-Key', key())
      .send({
        issuanceId: debtId,
        requestedUnits: units,
        requestedAmount: amount,
        paymentReference: 'FR76 DEMO',
      })
      .expect(201)
  ).body as SubscriptionView;
}

function submit(
  agent: Agent,
  id: string,
  declarations = { documentsAccepted: true, eligibilityDeclared: true },
) {
  return agent
    .post(`/api/v1/subscriptions/${id}/submit`)
    .set('Idempotency-Key', key())
    .send(declarations);
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

beforeAll(async () => {
  ctx = await startIntegrationApp();
  operator = await ctx.signIn('northwind.operator@example.com');
  admin = await ctx.signIn('northwind.admin1@example.com');
  debtId = await idOf(`SELECT id FROM issuance.issuance WHERE code = 'NWSD26'`);
  // The debt issuance must still be open (another test file may have closed it).
  await ctx.admin.query(
    `UPDATE issuance.issuance_terms SET subscription_start_date = current_date - 20,
       subscription_end_date = current_date + 40 WHERE issuance_id = $1`,
    [debtId],
  );
  await ctx.admin.query(`UPDATE issuance.issuance SET status = 'SUBSCRIPTION_OPEN' WHERE id = $1`, [
    debtId,
  ]);
  await ctx.admin.query(
    `UPDATE core.outbox_event SET processed_at = now() WHERE processed_at IS NULL`,
  );
  await ctx.admin.query(`DELETE FROM pgboss.job WHERE name = $1`, [QUEUES.outboxEvent.name]);
});

afterAll(async () => {
  // The last test cancels the debt issuance: other test files expect it open.
  await ctx.admin.query(`UPDATE issuance.issuance SET status = 'SUBSCRIPTION_OPEN' WHERE id = $1`, [
    debtId,
  ]);
  await ctx.close();
});

describe('a subscription from end to end ("souscription de bout en bout")', () => {
  it('is prepared and submitted by the investor, reviewed and approved by the issuer', async () => {
    const investor = await ctx.signIn('investor.a@example.com');
    const created = await draft(investor, '150');
    expect(created).toMatchObject({ status: 'DRAFT', requestedAmount: '150000.00' });

    // Documents accepted and eligibility declared are required (SPEC §9.1).
    const undeclared = await submit(investor, created.id, {
      documentsAccepted: false,
      eligibilityDeclared: true,
    }).expect(400);
    expect(errorOf(undeclared).details[0]).toMatchObject({ code: 'DOCUMENTS_NOT_ACCEPTED' });

    const submitted = (await submit(investor, created.id).expect(200)).body as SubscriptionView;
    expect(submitted.status).toBe('SUBMITTED');
    const assessment = await ctx.admin.query(
      `SELECT context, result FROM investor.eligibility_assessment WHERE id = $1`,
      [submitted.eligibilityAssessmentId],
    );
    expect(assessment.rows[0]).toEqual({ context: 'SUBSCRIPTION', result: 'ELIGIBLE' });
    await deliverEvents();
    expect(await notified('northwind.operator@example.com', 'SUBSCRIPTION_SUBMITTED')).toBe(true);

    await operator
      .post(`/api/v1/subscriptions/${created.id}/start-review`)
      .set('Idempotency-Key', key())
      .expect(200);
    await operator
      .post(`/api/v1/subscriptions/${created.id}/approve`)
      .set('Idempotency-Key', key())
      .expect(403);
    const approved = await admin
      .post(`/api/v1/subscriptions/${created.id}/approve`)
      .set('Idempotency-Key', key())
      .expect(200);
    expect((approved.body as SubscriptionView).status).toBe('APPROVED');
    await deliverEvents();
    expect(await notified('investor.a@example.com', 'SUBSCRIPTION_APPROVED')).toBe(true);

    const history = (
      await investor.get(`/api/v1/subscriptions/${created.id}/transitions`).expect(200)
    ).body as {
      toStatus: string;
    }[];
    expect(history.map((row) => row.toStatus)).toEqual([
      'DRAFT',
      'SUBMITTED',
      'UNDER_REVIEW',
      'APPROVED',
    ]);

    // The investor cannot cancel an approved subscription; the issuer can, with a reason.
    const late = await investor
      .post(`/api/v1/subscriptions/${created.id}/cancel`)
      .set('Idempotency-Key', key())
      .send({})
      .expect(409);
    expect(errorOf(late).code).toBe('INVALID_STATE_TRANSITION');
  });

  it('shows an investor its own subscriptions only', async () => {
    const other = await ctx.signIn('investor.b@example.com');
    const mine = (await other.get('/api/v1/subscriptions?pageSize=100').expect(200)).body as {
      data: { investorName: string }[];
    };
    expect(mine.data.every((row) => row.investorName.startsWith('Baltic'))).toBe(true);
    const alpineSubscription = await idOf(
      `SELECT s.id FROM registry.subscription s JOIN investor.investor i ON i.id = s.investor_id
       WHERE i.legal_name LIKE 'Alpine%' LIMIT 1`,
    );
    await other.get(`/api/v1/subscriptions/${alpineSubscription}`).expect(404);
    const all = (await operator.get('/api/v1/subscriptions?pageSize=100').expect(200)).body as {
      meta: { total: number };
    };
    expect(all.meta.total).toBeGreaterThan(0);
  });

  it('never lets an investor subscribe to an issuance it is not invited to', async () => {
    // Iris is never invited to the solar project (other test files invite Alpine to it).
    const investor = await ctx.signIn('investor.d@example.com');
    const aurora = await idOf(`SELECT id FROM issuance.issuance WHERE code = 'AURORA27'`);
    await investor
      .post('/api/v1/subscriptions')
      .set('Idempotency-Key', key())
      .send({ issuanceId: aurora, requestedUnits: '100', requestedAmount: '100000.00' })
      .expect(404);
  });
});

describe('scenario 2 — investor not eligible (SPEC §29)', () => {
  it('refuses the subscription of an investor whose KYC/KYB has expired, and keeps the decision', async () => {
    const investor = await ctx.signIn('investor.d@example.com');
    const created = await draft(investor, '120');
    const refused = await submit(investor, created.id).expect(422);
    expect(errorOf(refused).code).toBe('ELIGIBILITY_FAILED');
    expect(errorOf(refused).details.map((detail) => detail.code)).toEqual(['KYC_EXPIRED']);

    // No subscription goes further (hence no position), and the decision is kept.
    const after = (await investor.get(`/api/v1/subscriptions/${created.id}`).expect(200))
      .body as SubscriptionView;
    expect(after.status).toBe('DRAFT');
    const decision = await ctx.admin.query(
      `SELECT a.result, a.context FROM investor.eligibility_assessment a
       JOIN investor.investor i ON i.id = a.investor_id
       WHERE i.legal_name LIKE 'Iris%' AND a.context = 'SUBSCRIPTION'`,
    );
    expect(decision.rows).toEqual([{ result: 'NOT_ELIGIBLE', context: 'SUBSCRIPTION' }]);
  });

  it('refuses the subscription of an investor whose country is excluded', async () => {
    await ctx.admin.query(
      `UPDATE issuance.eligibility_rule_set SET excluded_countries = '{CH}' WHERE issuance_id = $1`,
      [debtId],
    );
    try {
      const investor = await ctx.signIn('investor.c@example.com');
      const created = await draft(investor, '100');
      const refused = await submit(investor, created.id).expect(422);
      expect(errorOf(refused).details).toEqual([
        expect.objectContaining({
          code: 'COUNTRY_EXCLUDED',
          meta: expect.objectContaining({ country: 'CH' }),
        }),
      ]);
    } finally {
      await ctx.admin.query(
        `UPDATE issuance.eligibility_rule_set SET excluded_countries = '{}' WHERE issuance_id = $1`,
        [debtId],
      );
    }
  });
});

describe('checks of SPEC §9.3', () => {
  it('refuses an amount that is not units times the nominal value, and one below the minimum', async () => {
    const investor = await ctx.signIn('investor.b@example.com');
    const mismatch = await draft(investor, '150', '149000.00');
    expect(errorOf(await submit(investor, mismatch.id).expect(422)).code).toBe(
      'AMOUNT_UNITS_MISMATCH',
    );
    const small = await draft(investor, '50');
    expect(errorOf(await submit(investor, small.id).expect(422)).code).toBe(
      'SUBSCRIPTION_BELOW_MINIMUM',
    );
  });

  it('adds up the investor’s active subscriptions against its maximum', async () => {
    const investor = await ctx.signIn('investor.b@example.com');
    const first = await draft(investor, '1900');
    await submit(investor, first.id).expect(200);
    const second = await draft(investor, '200');
    const refused = await submit(investor, second.id).expect(422);
    expect(errorOf(refused)).toMatchObject({
      code: 'SUBSCRIPTION_LIMIT_EXCEEDED',
      details: [
        expect.objectContaining({ meta: expect.objectContaining({ maximum: '2000000.0000' }) }),
      ],
    });
    // Once the first one is cancelled, the second one fits.
    await investor
      .post(`/api/v1/subscriptions/${first.id}/cancel`)
      .set('Idempotency-Key', key())
      .send({})
      .expect(200);
    await submit(investor, second.id).expect(200);
  });
});

describe('decisions of the issuer (P11-3)', () => {
  it('rejects with a reason only, and cancels with a reason, telling the investor', async () => {
    const investor = await ctx.signIn('investor.c@example.com');
    const toReject = await draft(investor, '100');
    await submit(investor, toReject.id).expect(200);
    await operator
      .post(`/api/v1/subscriptions/${toReject.id}/start-review`)
      .set('Idempotency-Key', key())
      .expect(200);
    await admin
      .post(`/api/v1/subscriptions/${toReject.id}/reject`)
      .set('Idempotency-Key', key())
      .send({ reason: '' })
      .expect(400);
    const rejected = await admin
      .post(`/api/v1/subscriptions/${toReject.id}/reject`)
      .set('Idempotency-Key', key())
      .send({ reason: 'Payment account not accepted' })
      .expect(200);
    expect(rejected.body).toMatchObject({
      status: 'REJECTED',
      rejectionReason: 'Payment account not accepted',
    });

    const toCancel = await draft(investor, '100');
    await submit(investor, toCancel.id).expect(200);
    const noReason = await operator
      .post(`/api/v1/subscriptions/${toCancel.id}/cancel`)
      .set('Idempotency-Key', key())
      .send({})
      .expect(422);
    expect(errorOf(noReason).code).toBe('COMMENT_REQUIRED');
    await operator
      .post(`/api/v1/subscriptions/${toCancel.id}/cancel`)
      .set('Idempotency-Key', key())
      .send({ reason: 'Duplicate request' })
      .expect(200);
    await deliverEvents();
    expect(await notified('investor.c@example.com', 'SUBSCRIPTION_REJECTED')).toBe(true);
    expect(await notified('investor.c@example.com', 'SUBSCRIPTION_CANCELLED')).toBe(true);
  });

  it('cancels the open subscriptions of a cancelled issuance', async () => {
    const investor = await ctx.signIn('investor.a@example.com');
    const pending = await draft(investor, '100');
    await submit(investor, pending.id).expect(200);
    await admin
      .post(`/api/v1/issuances/${debtId}/cancel`)
      .set('Idempotency-Key', key())
      .send({ comment: 'Market conditions (demo)' })
      .expect(200);
    await deliverEvents();
    const after = (await operator.get(`/api/v1/subscriptions/${pending.id}`).expect(200))
      .body as SubscriptionView;
    expect(after).toMatchObject({ status: 'CANCELLED', cancellationReason: 'ISSUANCE_CANCELLED' });
  });
});
