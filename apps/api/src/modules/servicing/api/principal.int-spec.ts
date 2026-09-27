// Repayment of the principal (phase 14b, docs/BACKLOG.md P14-5, SPEC §12.6): at maturity, and by a
// total early redemption. REDEMPTION movements bring every position to zero, then the issuance
// is MATURED.
import { randomUUID } from 'node:crypto';
import { dateInTimeZone, type ErrorResponseBody } from '@veris/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startIntegrationApp, type IntegrationApp } from '../../../test/integration-app.js';
import { allocate, closedIssuance, type ClosedIssuance } from '../../../test/registry-fixtures.js';
import { LedgerWriter } from '../../registry/index.js';

type Agent = ReturnType<typeof request.agent>;
let ctx: IntegrationApp;
let operator: Agent;
let admin1: Agent;
let admin2: Agent;
const errorOf = (response: request.Response) => (response.body as ErrorResponseBody).error;
const today = () => dateInTimeZone(new Date(), 'Europe/Paris');

interface ScheduleView {
  id: string;
  type: string;
  status: string;
  paymentDate: string;
  periodEnd: string;
}

function post(agent: Agent, path: string, body?: object) {
  const call = agent.post(`/api/v1${path}`).set('Idempotency-Key', randomUUID());
  return body ? call.send(body) : call;
}

/** An active issuance whose subscriptions are paid, with the given terms. */
async function activeIssuance(
  terms: string,
): Promise<{ notes: ClosedIssuance; schedule: ScheduleView[] }> {
  const notes = await closedIssuance(ctx, { Alpine: '300', Baltic: '300' });
  await ctx.admin.query(
    `UPDATE issuance.issuance_terms SET interest_rate = 0.04, day_count = '30E_360',
       business_day_convention = 'FOLLOWING', record_date_offset_business_days = 1, ${terms}
     WHERE issuance_id = $1`,
    [notes.issuanceId],
  );
  await ctx.admin.query(
    `UPDATE issuance.eligibility_rule_set SET transfers_allowed = true WHERE issuance_id = $1`,
    [notes.issuanceId],
  );
  await allocate(operator, admin2, notes.issuanceId, { Alpine: '300', Baltic: '300' });
  for (const subscription of Object.values(notes.subscriptions)) {
    await post(operator, `/subscriptions/${subscription}/payment/prepare`).expect(200);
    await post(admin1, `/subscriptions/${subscription}/payment/confirm`).expect(200);
  }
  const schedule = (await post(admin1, `/issuances/${notes.issuanceId}/activate`).expect(200))
    .body as ScheduleView[];
  // Holders allocated today count at the record dates of these tests.
  await ctx.admin.query(
    `UPDATE servicing.coupon_schedule SET record_date = $2 WHERE issuance_id = $1`,
    [notes.issuanceId, today()],
  );
  return { notes, schedule };
}

/** A distribution calculated, approved and whose payment instruction is prepared. */
async function prepared(scheduleId: string): Promise<string> {
  const created = await post(operator, '/distributions', { couponScheduleId: scheduleId }).expect(
    201,
  );
  const id = (created.body as { id: string }).id;
  await post(operator, `/distributions/${id}/calculate`).expect(200);
  await post(operator, `/distributions/${id}/submit-for-review`).expect(200);
  await post(admin1, `/distributions/${id}/approve`).expect(200);
  await post(operator, `/distributions/${id}/payment-instruction`).expect(200);
  await post(operator, `/distributions/${id}/payment-instruction/prepare`).expect(200);
  return id;
}

async function positions(issuanceId: string) {
  const { rows } = await ctx.admin.query<{ held: string; acquisition: string }>(
    `SELECT quantity_held::int::text AS held, acquisition_amount::int::text AS acquisition
     FROM registry.position WHERE issuance_id = $1`,
    [issuanceId],
  );
  return rows;
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

describe('repayment at maturity (SPEC §12.6)', () => {
  let notes: ClosedIssuance;
  let schedule: ScheduleView[];

  beforeAll(async () => {
    ({ notes, schedule } = await activeIssuance(
      `issue_date = '2026-03-15', maturity_date = '2026-09-15', distribution_frequency = 'SEMI_ANNUAL'`,
    ));
  });

  it('comes after the last coupon', async () => {
    expect(schedule.map((row) => row.type)).toEqual(['COUPON', 'PRINCIPAL']);
    const early = await post(operator, '/distributions', {
      couponScheduleId: schedule[1]!.id,
    }).expect(409);
    expect(errorOf(early).details[0]).toMatchObject({ code: 'COUPONS_NOT_DISTRIBUTED' });
    const coupon = await prepared(schedule[0]!.id);
    await post(admin2, `/distributions/${coupon}/payment-instruction/confirm`).expect(200);
  });

  it('pays the nominal value of every unit, never while units are blocked', async () => {
    const principal = await prepared(schedule[1]!.id);
    const lines = (await operator.get(`/api/v1/distributions/${principal}/lines`).expect(200))
      .body as { grossAmount: string }[];
    expect(lines.map((line) => line.grossAmount)).toEqual(['300000.00', '300000.00']);

    // A transfer under review blocks units: the repayment waits.
    const investor = await ctx.signIn('investor.a@example.com');
    const { rows } = await ctx.admin.query<{ code: string }>(
      `SELECT recipient_code AS code FROM investor.investor WHERE legal_name LIKE 'Cedar%'`,
    );
    const transfer = await post(investor, '/transfers', {
      issuanceId: notes.issuanceId,
      recipientCode: rows[0]!.code,
      quantity: '10',
    }).expect(201);
    const transferId = (transfer.body as { id: string }).id;
    await post(investor, `/transfers/${transferId}/submit`).expect(200);
    const blocked = await post(
      admin2,
      `/distributions/${principal}/payment-instruction/confirm`,
    ).expect(409);
    expect(errorOf(blocked).details[0]).toMatchObject({ code: 'UNITS_BLOCKED' });
    await post(investor, `/transfers/${transferId}/cancel`, {}).expect(200);

    const paid = await post(
      admin2,
      `/distributions/${principal}/payment-instruction/confirm`,
    ).expect(200);
    expect((paid.body as { status: string }).status).toBe('PAID');
  });

  it('brings every position to zero with REDEMPTION movements, and the issuance is MATURED', async () => {
    expect(await positions(notes.issuanceId)).toEqual([
      { held: '0', acquisition: '0' },
      { held: '0', acquisition: '0' },
      { held: '0', acquisition: '0' },
    ]);
    const { rows } = await ctx.admin.query<{ type: string; quantity: string }>(
      `SELECT type, quantity::int::text AS quantity FROM registry.ledger_entry
       WHERE issuance_id = $1 AND type = 'REDEMPTION' ORDER BY sequence_no`,
      [notes.issuanceId],
    );
    // The two investors and the unsold units of the treasury.
    expect(rows.map((row) => row.quantity).sort()).toEqual(['300', '300', '400']);
    const issuance = await operator.get(`/api/v1/issuances/${notes.issuanceId}`).expect(200);
    expect((issuance.body as { status: string }).status).toBe('MATURED');
    expect(
      await ctx.app.get(LedgerWriter).breachesFor(notes.tenantId, notes.issuanceId, '1000'),
    ).toEqual([]);
  });
});

describe('total early redemption (SPEC §12.6)', () => {
  let notes: ClosedIssuance;
  let schedule: ScheduleView[];

  beforeAll(async () => {
    ({ notes, schedule } = await activeIssuance(
      `issue_date = '2026-01-15', maturity_date = '2029-01-15', distribution_frequency = 'SEMI_ANNUAL'`,
    ));
  });

  it('needs a date from today to before maturity', async () => {
    await post(operator, `/issuances/${notes.issuanceId}/early-redemption`, {
      paymentDate: today(),
    }).expect(403);
    const past = await post(admin1, `/issuances/${notes.issuanceId}/early-redemption`, {
      paymentDate: '2026-01-01',
    }).expect(400);
    expect(errorOf(past).details[0]).toMatchObject({ code: 'EARLY_REDEMPTION_DATE_INVALID' });
  });

  it('cancels the payments not made yet and schedules the principal on the date', async () => {
    // The first coupon (15 July 2026) is due before today: it is distributed first.
    const coupon = await prepared(schedule[0]!.id);
    await post(admin2, `/distributions/${coupon}/payment-instruction/confirm`).expect(200);
    const after = (
      await post(admin1, `/issuances/${notes.issuanceId}/early-redemption`, {
        paymentDate: today(),
      }).expect(200)
    ).body as ScheduleView[];
    expect(after.filter((row) => row.status === 'CANCELLED')).toHaveLength(schedule.length - 1);
    const principal = after.at(-1)!;
    expect(principal).toMatchObject({ type: 'PRINCIPAL', status: 'SCHEDULED', periodEnd: today() });

    await ctx.admin.query(`UPDATE servicing.coupon_schedule SET record_date = $2 WHERE id = $1`, [
      principal.id,
      today(),
    ]);
    const repayment = await prepared(principal.id);
    await post(admin2, `/distributions/${repayment}/payment-instruction/confirm`).expect(200);
    const issuance = await operator.get(`/api/v1/issuances/${notes.issuanceId}`).expect(200);
    expect((issuance.body as { status: string }).status).toBe('MATURED');
    expect((await positions(notes.issuanceId)).every((row) => row.held === '0')).toBe(true);
    // Nothing more to redeem.
    await post(admin1, `/issuances/${notes.issuanceId}/early-redemption`, {
      paymentDate: today(),
    }).expect(409);
  });
});
