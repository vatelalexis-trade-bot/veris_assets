// Activation, coupon schedule and distributions (phase 14a, docs/BACKLOG.md P14-1 to P14-4), and
// scenario 6 of SPEC §29 through the API.
import { randomUUID } from 'node:crypto';
import { dateInTimeZone, type ErrorResponseBody } from '@virtus/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { QUEUES } from '../../../core/jobs/queues.js';
import type { OutboxJob } from '../../../core/outbox/outbox.js';
import { OutboxRelay } from '../../../core/outbox/outbox-relay.js';
import {
  PAYMENT_PROVIDER,
  type PaymentProvider,
} from '../../../core/providers/payment-provider.js';
import { generatedDocuments } from '../../../test/generated-documents.js';
import { startIntegrationApp, type IntegrationApp } from '../../../test/integration-app.js';
import { allocate, closedIssuance, type ClosedIssuance } from '../../../test/registry-fixtures.js';

type Agent = ReturnType<typeof request.agent>;
let ctx: IntegrationApp;
let operator: Agent;
let admin1: Agent;
let admin2: Agent;
let notes: ClosedIssuance;
let schedule: ScheduleView[];
const errorOf = (response: request.Response) => (response.body as ErrorResponseBody).error;
const key = () => randomUUID();
const today = () => dateInTimeZone(new Date(), 'Europe/Paris');

interface ScheduleView {
  id: string;
  sequence: number;
  type: string;
  periodStart: string;
  periodEnd: string;
  paymentDate: string;
  recordDate: string;
  status: string;
}

interface DistributionView {
  id: string;
  status: string;
  totalGrossAmount: string | null;
  roundingDifference: string | null;
  beneficiaryCount: number | null;
  periodFraction: string | null;
  instruction: { status: string; providerReference: string | null } | null;
}

interface LineView {
  investorName: string | null;
  eligibleQuantity: string;
  grossAmount: string;
}

function post(agent: Agent, path: string, body?: object) {
  const call = agent.post(`/api/v1${path}`).set('Idempotency-Key', key());
  return body ? call.send(body) : call;
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

/** The record date of a scheduled payment moved to today: holders allocated today count. */
async function dueToday(scheduleId: string): Promise<void> {
  await ctx.admin.query(`UPDATE servicing.coupon_schedule SET record_date = $2 WHERE id = $1`, [
    scheduleId,
    today(),
  ]);
}

beforeAll(async () => {
  ctx = await startIntegrationApp();
  operator = await ctx.signIn('northwind.operator@example.com');
  admin1 = await ctx.signIn('northwind.admin1@example.com');
  admin2 = await ctx.signIn('northwind.admin2@example.com');
  await ctx.admin.query(
    `UPDATE core.outbox_event SET processed_at = now() WHERE processed_at IS NULL`,
  );
  await ctx.admin.query(`DELETE FROM pgboss.job WHERE name = $1`, [QUEUES.outboxEvent.name]);
  // Scenario 6: 5 % semi-annual in 30E/360, nominal 1 000 €; Alpine holds 100 units.
  notes = await closedIssuance(ctx, { Alpine: '100', Baltic: '433' });
  await ctx.admin.query(
    `UPDATE issuance.issuance_terms SET issue_date = '2026-03-15', maturity_date = '2027-03-15',
       interest_rate = 0.05, distribution_frequency = 'SEMI_ANNUAL', day_count = '30E_360',
       rounding_method = 'HALF_EVEN', business_day_convention = 'FOLLOWING',
       record_date_offset_business_days = 1
     WHERE issuance_id = $1`,
    [notes.issuanceId],
  );
  await allocate(operator, admin2, notes.issuanceId, { Alpine: '100', Baltic: '433' });
  await post(operator, `/subscriptions/${notes.subscriptions.Alpine}/payment/prepare`).expect(200);
  await post(admin1, `/subscriptions/${notes.subscriptions.Alpine}/payment/confirm`).expect(200);
});

afterAll(async () => {
  await ctx.close();
});

describe('activation and coupon schedule (SPEC §12.1, D-009, D-012)', () => {
  it('waits until every allocated subscription is paid', async () => {
    const refused = await post(admin1, `/issuances/${notes.issuanceId}/activate`).expect(422);
    expect(errorOf(refused)).toMatchObject({
      code: 'PENDING_PAYMENTS_REMAINING',
      details: [expect.objectContaining({ meta: { count: 1 } })],
    });
    await post(operator, `/subscriptions/${notes.subscriptions.Baltic}/payment/prepare`).expect(
      200,
    );
    await post(admin1, `/subscriptions/${notes.subscriptions.Baltic}/payment/confirm`).expect(200);
    await post(operator, `/issuances/${notes.issuanceId}/activate`).expect(403);
  });

  it('activates the issuance and schedules its coupons and principal', async () => {
    schedule = (await post(admin1, `/issuances/${notes.issuanceId}/activate`).expect(200))
      .body as ScheduleView[];
    expect(
      schedule.map((row) => [
        row.type,
        row.periodStart,
        row.periodEnd,
        row.paymentDate,
        row.recordDate,
      ]),
    ).toEqual([
      ['COUPON', '2026-03-15', '2026-09-15', '2026-09-15', '2026-09-14'],
      // 15 March 2027 is a Monday: paid that day, recorded on the Friday before.
      ['COUPON', '2026-09-15', '2027-03-15', '2027-03-15', '2027-03-12'],
      ['PRINCIPAL', '2026-03-15', '2027-03-15', '2027-03-15', '2027-03-12'],
    ]);
    const issuance = await operator.get(`/api/v1/issuances/${notes.issuanceId}`).expect(200);
    expect((issuance.body as { status: string }).status).toBe('ACTIVE');
    await post(admin1, `/issuances/${notes.issuanceId}/activate`).expect(409);
  });
});

describe('scenario 6 — coupon (SPEC §29)', () => {
  let distribution: DistributionView;

  it('calculates exactly 2 500.00 € for 100 units, and a total equal to the sum of the lines', async () => {
    await dueToday(schedule[0]!.id);
    distribution = (
      await post(operator, '/distributions', { couponScheduleId: schedule[0]!.id }).expect(201)
    ).body as DistributionView;
    expect(distribution.status).toBe('DRAFT');
    // One distribution per scheduled payment.
    const twice = await post(operator, '/distributions', {
      couponScheduleId: schedule[0]!.id,
    }).expect(422);
    expect(errorOf(twice).code).toBe('DISTRIBUTION_ALREADY_EXISTS');

    distribution = (await post(operator, `/distributions/${distribution.id}/calculate`).expect(200))
      .body as DistributionView;
    expect(distribution).toMatchObject({
      status: 'CALCULATED',
      periodFraction: '0.5',
      totalGrossAmount: '13325.00',
      roundingDifference: '0',
      beneficiaryCount: 2,
    });
    const lines = (await operator.get(`/api/v1/distributions/${distribution.id}/lines`).expect(200))
      .body as LineView[];
    const alpine = lines.find((line) => line.investorName?.startsWith('Alpine'))!;
    expect(alpine).toMatchObject({ eligibleQuantity: '100', grossAmount: '2500.00' });
    expect(lines.find((line) => line.investorName?.startsWith('Baltic'))?.grossAmount).toBe(
      '10825.00',
    );
  });

  it('is approved by another administrator than the one who submitted it (four eyes)', async () => {
    await post(operator, `/distributions/${distribution.id}/submit-for-review`).expect(200);
    await post(operator, `/distributions/${distribution.id}/approve`).expect(403);
    await deliverEvents();
    expect(await notified('northwind.admin1@example.com', 'DISTRIBUTION_TO_APPROVE')).toBe(true);
    distribution = (await post(admin1, `/distributions/${distribution.id}/approve`).expect(200))
      .body as DistributionView;
    expect(distribution.status).toBe('APPROVED');
  });

  it('gives the same result when calculated again from its snapshot', async () => {
    const check = await post(admin2, `/distributions/${distribution.id}/recalculate-check`).expect(
      200,
    );
    expect(check.body).toEqual({
      snapshotReproducible: true,
      identical: true,
      totalGrossAmount: '13325.00',
      differences: [],
    });
    // Even after the registry moved on: the snapshot is kept, never recomputed.
    await ctx.admin.query(
      `UPDATE issuance.issuance_terms SET interest_rate = 0.07 WHERE issuance_id = $1`,
      [notes.issuanceId],
    );
    const again = await post(admin2, `/distributions/${distribution.id}/recalculate-check`).expect(
      200,
    );
    expect((again.body as { identical: boolean }).identical).toBe(true);
    await ctx.admin.query(
      `UPDATE issuance.issuance_terms SET interest_rate = 0.05 WHERE issuance_id = $1`,
      [notes.issuanceId],
    );
  });

  it('generates the fictitious payment instruction and its CSV, then is paid with four eyes', async () => {
    distribution = (
      await post(operator, `/distributions/${distribution.id}/payment-instruction`).expect(200)
    ).body as DistributionView;
    expect(distribution).toMatchObject({
      status: 'PAYMENT_INSTRUCTION_GENERATED',
      instruction: { status: 'GENERATED' },
    });
    const csv = await operator
      .get(`/api/v1/distributions/${distribution.id}/payment-instruction/csv`)
      .expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    const rows = csv.text.trim().split('\n');
    expect(rows[0]).toBe('# DEMONSTRATION - fictitious payment instruction - no real payment');
    expect(rows.some((row) => row.includes('Alpine') && row.endsWith(',2500.00,EUR'))).toBe(true);

    await post(operator, `/distributions/${distribution.id}/payment-instruction/prepare`).expect(
      200,
    );
    await post(operator, `/distributions/${distribution.id}/payment-instruction/confirm`).expect(
      403,
    );
    await deliverEvents();
    expect(await notified('northwind.admin2@example.com', 'DISTRIBUTION_PAYMENT_TO_CONFIRM')).toBe(
      true,
    );
    distribution = (
      await post(admin2, `/distributions/${distribution.id}/payment-instruction/confirm`).expect(
        200,
      )
    ).body as DistributionView;
    expect(distribution).toMatchObject({ status: 'PAID', instruction: { status: 'CONFIRMED' } });
    const after = (
      await operator.get(`/api/v1/issuances/${notes.issuanceId}/coupon-schedule`).expect(200)
    ).body as ScheduleView[];
    expect(after[0]).toMatchObject({ status: 'DISTRIBUTED' });
    await deliverEvents();
    expect(await notified('investor.a@example.com', 'DISTRIBUTION_PAID')).toBe(true);
    // Each holder gets its coupon notice (P15-10), and sees it in its documents.
    const notices = await generatedDocuments(
      ctx,
      'COUPON_NOTICE',
      'investor.a@example.com',
      notes.issuanceId,
    );
    expect(notices).toEqual([expect.objectContaining({ header: '%PDF-' })]);
    const investor = await ctx.signIn('investor.a@example.com');
    const listed = (await investor.get(`/api/v1/documents?type=COUPON_NOTICE`).expect(200))
      .body as { data: { id: string }[] };
    expect(listed.data.map((row) => row.id)).toContain(notices[0]!.id);
  });

  it('shows an investor its own line only', async () => {
    const investor = await ctx.signIn('investor.a@example.com');
    const own = (await investor.get(`/api/v1/distributions/${distribution.id}/lines`).expect(200))
      .body as LineView[];
    expect(own).toEqual([expect.objectContaining({ grossAmount: '2500.00' })]);
    const listed = (await investor.get('/api/v1/distributions').expect(200)).body as {
      data: { id: string }[];
    };
    expect(listed.data.map((row) => row.id)).toContain(distribution.id);
    await investor.post(`/api/v1/distributions/${distribution.id}/recalculate-check`).expect(404);
    const other = await ctx.signIn('investor.d@example.com');
    await other.get(`/api/v1/distributions/${distribution.id}`).expect(404);
  });
});

describe('the life of a distribution (docs/DATA_MODEL.md §4.5)', () => {
  it('is not calculated before its record date', async () => {
    const created = (
      await post(operator, '/distributions', { couponScheduleId: schedule[1]!.id }).expect(201)
    ).body as DistributionView;
    const early = await post(operator, `/distributions/${created.id}/calculate`).expect(409);
    expect(errorOf(early).details[0]).toMatchObject({
      code: 'RECORD_DATE_NOT_REACHED',
      meta: { recordDate: '2027-03-12' },
    });
    // Cancelled with a reason, the scheduled payment can be distributed again.
    await post(admin1, `/distributions/${created.id}/cancel`, {}).expect(400);
    await post(admin1, `/distributions/${created.id}/cancel`, {
      comment: 'Created too early',
    }).expect(200);
    await dueToday(schedule[1]!.id);
    const again = (
      await post(operator, '/distributions', { couponScheduleId: schedule[1]!.id }).expect(201)
    ).body as DistributionView;
    await post(operator, `/distributions/${again.id}/calculate`).expect(200);
    await post(operator, `/distributions/${again.id}/submit-for-review`).expect(200);
    // Sent back to draft, it is calculated again: a new calculation, the old lines kept.
    await post(admin1, `/distributions/${again.id}/return-to-draft`, {
      comment: 'Registry corrected',
    }).expect(200);
    await post(operator, `/distributions/${again.id}/calculate`).expect(200);
    const { rows } = await ctx.admin.query<{ calculation_no: number; lines: string }>(
      `SELECT calculation_no, count(*)::text AS lines FROM servicing.distribution_line
       WHERE distribution_id = $1 GROUP BY calculation_no ORDER BY calculation_no`,
      [again.id],
    );
    expect(rows).toEqual([
      { calculation_no: 1, lines: '2' },
      { calculation_no: 2, lines: '2' },
    ]);
  });

  it('keeps a failed payment, and can be paid with a new instruction', async () => {
    const [draft] = (
      await operator
        .get(`/api/v1/distributions?issuanceId=${notes.issuanceId}&status=CALCULATED`)
        .expect(200)
    ).body.data as DistributionView[];
    await post(operator, `/distributions/${draft!.id}/submit-for-review`).expect(200);
    await post(admin2, `/distributions/${draft!.id}/approve`).expect(200);
    await post(operator, `/distributions/${draft!.id}/payment-instruction`).expect(200);
    await post(operator, `/distributions/${draft!.id}/payment-instruction/prepare`).expect(200);
    const provider = ctx.app.get<PaymentProvider>(PAYMENT_PROVIDER);
    const spy = vi.spyOn(provider, 'confirm').mockResolvedValueOnce({ received: false });
    const failed = await post(
      admin1,
      `/distributions/${draft!.id}/payment-instruction/confirm`,
    ).expect(200);
    spy.mockRestore();
    expect(failed.body).toMatchObject({ status: 'FAILED', instruction: { status: 'FAILED' } });
    await post(operator, `/distributions/${draft!.id}/payment-instruction`).expect(200);
    await post(operator, `/distributions/${draft!.id}/payment-instruction/prepare`).expect(200);
    const paid = await post(
      admin1,
      `/distributions/${draft!.id}/payment-instruction/confirm`,
    ).expect(200);
    expect(paid.body).toMatchObject({ status: 'PAID' });
    const history = (
      await operator.get(`/api/v1/distributions/${draft!.id}/transitions`).expect(200)
    ).body as { toStatus: string }[];
    expect(history.map((row) => row.toStatus)).toContain('FAILED');
  });

  it('keeps the snapshots and the lines append-only in the database', async () => {
    await expect(
      ctx.admin.query(`UPDATE registry.registry_snapshot_line SET quantity_held = 1`),
    ).rejects.toThrow(/append-only/);
    await expect(ctx.admin.query(`DELETE FROM servicing.distribution_line`)).rejects.toThrow(
      /append-only/,
    );
  });
});
