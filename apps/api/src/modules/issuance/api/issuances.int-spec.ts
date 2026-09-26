// Issuances (phase 10, docs/BACKLOG.md P10-1 to P10-5) and scenario 1 of SPEC §29 at the API level
// (the browser version runs with Playwright, tests/e2e).
import { randomUUID } from 'node:crypto';
import type { ErrorResponseBody } from '@virtus/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startIntegrationApp, type IntegrationApp } from '../../../test/integration-app.js';
import { SubscriptionAutoClose } from '../application/subscription-auto-close.js';

type Agent = ReturnType<typeof request.agent>;
let ctx: IntegrationApp;
let operator: Agent;
let admin1: Agent;
let admin2: Agent;
const errorOf = (response: request.Response) => (response.body as ErrorResponseBody).error;
const key = () => randomUUID();

interface IssuanceView {
  id: string;
  status: string;
  version: number;
  terms: { version: number; targetAmount: string | null; interestRate: string | null };
  eligibilityRules: { version: number; rulesVersion: number };
}

const HELIOS_TERMS = {
  targetAmount: '5000000.00',
  minimumAmount: '2000000.00',
  maximumAmount: '6000000.00',
  nominalValue: '1000.00',
  totalUnits: '5000',
  interestRate: '0.05',
  rateType: 'FIXED',
  distributionFrequency: 'SEMI_ANNUAL',
  dayCount: '30E_360',
  subscriptionStartDate: '2026-10-01',
  subscriptionEndDate: '2026-12-31',
  issueDate: '2027-01-15',
  maturityDate: '2032-01-15',
  minSubscriptionAmount: '100000.00',
  maxAmountPerInvestor: '1000000.00',
};

/** A complete draft, as the wizard builds it step by step. */
async function draft(agent: Agent, code: string): Promise<IssuanceView> {
  const created = (
    await agent
      .post('/api/v1/issuances')
      .set('Idempotency-Key', key())
      .send({ name: `Helios Solar SPV 2027 ${code}`, code })
      .expect(201)
  ).body as IssuanceView;
  const general = (
    await agent
      .patch(`/api/v1/issuances/${created.id}`)
      .set('If-Match', `"${created.version}"`)
      .send({
        assetCategory: 'RENEWABLE_ENERGY',
        countryCode: 'FR',
        currency: 'EUR',
        legalIssuerName: 'Helios Solar SPV SAS (demo)',
        wizardStep: 'FINANCIAL',
      })
      .expect(200)
  ).body as IssuanceView;
  const terms = (
    await agent
      .patch(`/api/v1/issuances/${created.id}/terms`)
      .set('If-Match', `"${general.terms.version}"`)
      .send(HELIOS_TERMS)
      .expect(200)
  ).body as IssuanceView;
  return (
    await agent
      .patch(`/api/v1/issuances/${created.id}/eligibility-rules`)
      .set('If-Match', `"${terms.eligibilityRules.version}"`)
      .send({ excludedCountries: ['US'], kycMinRemainingValidityDays: 90 })
      .expect(200)
  ).body as IssuanceView;
}

async function idOf(query: string): Promise<string> {
  return (await ctx.admin.query<{ id: string }>(query)).rows[0]!.id;
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

describe('scenario 1 — issuance creation (SPEC §29)', () => {
  it('is created with the wizard, submitted by the operator and approved by an administrator', async () => {
    const helios = await draft(operator, 'HELIOS27');
    expect(helios.terms).toMatchObject({ targetAmount: '5000000.00', interestRate: '0.05' });
    expect(helios.eligibilityRules.rulesVersion).toBe(2);

    const checks = await operator.post(`/api/v1/issuances/${helios.id}/validate`).expect(200);
    expect(checks.body).toEqual({ consistent: true, failures: [] });

    const submitted = await operator
      .post(`/api/v1/issuances/${helios.id}/submit`)
      .set('Idempotency-Key', key())
      .expect(200);
    expect((submitted.body as IssuanceView).status).toBe('UNDER_REVIEW');

    // The operator cannot approve (not an administrator), the administrator can.
    await operator
      .post(`/api/v1/issuances/${helios.id}/approve`)
      .set('Idempotency-Key', key())
      .expect(403);
    const approved = await admin2
      .post(`/api/v1/issuances/${helios.id}/approve`)
      .set('Idempotency-Key', key())
      .expect(200);
    expect((approved.body as IssuanceView).status).toBe('APPROVED');

    const history = (await operator.get(`/api/v1/issuances/${helios.id}/transitions`).expect(200))
      .body as {
      fromStatus: string | null;
      toStatus: string;
      actorName: string | null;
    }[];
    expect(history.map((row) => [row.fromStatus, row.toStatus])).toEqual([
      [null, 'DRAFT'],
      ['DRAFT', 'UNDER_REVIEW'],
      ['UNDER_REVIEW', 'APPROVED'],
    ]);
    expect(history[2]!.actorName).toBe('Northwind Admin Two (demo)');

    const audit = await ctx.admin.query<{ action: string }>(
      `SELECT action FROM audit.audit_event WHERE resource_id = $1 ORDER BY occurred_at`,
      [helios.id],
    );
    expect(audit.rows.map((row) => row.action)).toEqual(
      expect.arrayContaining(['ISSUANCE_CREATED', 'ISSUANCE_UNDER_REVIEW', 'ISSUANCE_APPROVED']),
    );
  });

  it('refuses the approval by the administrator who submitted it (four eyes)', async () => {
    const own = await draft(admin1, 'HELIOS4E');
    await admin1
      .post(`/api/v1/issuances/${own.id}/submit`)
      .set('Idempotency-Key', key())
      .expect(200);
    const refused = await admin1
      .post(`/api/v1/issuances/${own.id}/approve`)
      .set('Idempotency-Key', key())
      .expect(403);
    expect(errorOf(refused).code).toBe('FOUR_EYES_VIOLATION');
    await expect
      .poll(
        async () =>
          (
            await ctx.admin.query(
              `SELECT 1 FROM audit.audit_event WHERE correlation_id = $1 AND result = 'DENIED'`,
              [refused.headers['x-correlation-id']],
            )
          ).rowCount,
      )
      .toBe(1);
  });
});

describe('wizard and checks (P10-1, P10-2)', () => {
  it('refuses to submit inconsistent terms, with every failed check', async () => {
    const created = await draft(operator, 'BROKEN1');
    await operator
      .patch(`/api/v1/issuances/${created.id}/terms`)
      .set('If-Match', `"${created.terms.version}"`)
      .send({ targetAmount: '4000000.00', subscriptionEndDate: '2027-03-01' })
      .expect(200);
    const refused = await operator
      .post(`/api/v1/issuances/${created.id}/submit`)
      .set('Idempotency-Key', key())
      .expect(422);
    expect(errorOf(refused).code).toBe('ISSUANCE_INCONSISTENT_TERMS');
    expect(errorOf(refused).details.map((detail) => detail.code)).toEqual([
      // 4 000 000 is still between the minimum and the maximum: only these two checks fail.
      'TARGET_NOT_EQUAL_NOMINAL_TIMES_UNITS',
      'DATE_ORDER_INVALID',
    ]);
  });

  it('keeps codes unique and refuses edits once submitted', async () => {
    const taken = await operator
      .post('/api/v1/issuances')
      .set('Idempotency-Key', key())
      .send({ name: 'Duplicate', code: 'nwsd26' })
      .expect(400);
    expect(errorOf(taken).details[0]).toMatchObject({ code: 'ISSUANCE_CODE_TAKEN' });

    const aurora = await idOf(`SELECT id FROM issuance.issuance WHERE code = 'AURORA27'`);
    const refused = await operator
      .patch(`/api/v1/issuances/${aurora}/terms`)
      .set('If-Match', '"1"')
      .send({ interestRate: '0.07' })
      .expect(409);
    expect(errorOf(refused).code).toBe('INVALID_STATE_TRANSITION');
  });
});

describe('life cycle (P10-3)', () => {
  it('requires a comment to send back to draft and to cancel', async () => {
    const created = await draft(operator, 'CYCLE1');
    await operator
      .post(`/api/v1/issuances/${created.id}/submit`)
      .set('Idempotency-Key', key())
      .expect(200);
    await admin1
      .post(`/api/v1/issuances/${created.id}/return-to-draft`)
      .set('Idempotency-Key', key())
      .send({ comment: '' })
      .expect(400);
    const back = await admin1
      .post(`/api/v1/issuances/${created.id}/return-to-draft`)
      .set('Idempotency-Key', key())
      .send({ comment: 'Check the maturity date' })
      .expect(200);
    expect(back.body).toMatchObject({ status: 'DRAFT', statusComment: 'Check the maturity date' });
    const cancelled = await admin1
      .post(`/api/v1/issuances/${created.id}/cancel`)
      .set('Idempotency-Key', key())
      .send({ comment: 'Project abandoned' })
      .expect(200);
    expect((cancelled.body as IssuanceView).status).toBe('CANCELLED');
  });

  it('opens subscriptions only from their start date', async () => {
    const aurora = await idOf(`SELECT id FROM issuance.issuance WHERE code = 'AURORA27'`);
    const early = await admin1
      .post(`/api/v1/issuances/${aurora}/open-subscription`)
      .set('Idempotency-Key', key())
      .expect(422);
    expect(errorOf(early).code).toBe('SUBSCRIPTION_WINDOW_NOT_STARTED');
  });
});

describe('invitations — the whitelist (P10-4)', () => {
  it('refuses an investor who is not eligible, and keeps the decision', async () => {
    const aurora = await idOf(`SELECT id FROM issuance.issuance WHERE code = 'AURORA27'`);
    const juniper = await idOf(`SELECT id FROM investor.investor WHERE legal_name LIKE 'Juniper%'`);
    const refused = await operator
      .post(`/api/v1/issuances/${aurora}/invitations`)
      .set('Idempotency-Key', key())
      .send({ investorId: juniper })
      .expect(422);
    expect(errorOf(refused).code).toBe('ELIGIBILITY_FAILED');
    expect(errorOf(refused).details).toEqual([
      expect.objectContaining({
        code: 'COUNTRY_EXCLUDED',
        meta: expect.objectContaining({ country: 'US' }),
      }),
    ]);
    const kept = await ctx.admin.query(
      `SELECT result FROM investor.eligibility_assessment
       WHERE investor_id = $1 AND issuance_id = $2 AND context = 'INVITATION'`,
      [juniper, aurora],
    );
    expect(kept.rows).toEqual([{ result: 'NOT_ELIGIBLE' }]);
  });

  it('invites, refuses a second invitation, revokes and invites again', async () => {
    const aurora = await idOf(`SELECT id FROM issuance.issuance WHERE code = 'AURORA27'`);
    const alpine = await idOf(`SELECT id FROM investor.investor WHERE legal_name LIKE 'Alpine%'`);
    const invited = await operator
      .post(`/api/v1/issuances/${aurora}/invitations`)
      .set('Idempotency-Key', key())
      .send({ investorId: alpine })
      .expect(201);
    const invitationId = (invited.body as { id: string }).id;
    const twice = await operator
      .post(`/api/v1/issuances/${aurora}/invitations`)
      .set('Idempotency-Key', key())
      .send({ investorId: alpine })
      .expect(400);
    expect(errorOf(twice).details[0]).toMatchObject({ code: 'ALREADY_INVITED' });

    // The investor now sees the issuance, and only its invitations.
    const investor = await ctx.signIn('investor.a@example.com');
    const seen = (await investor.get('/api/v1/issuances').expect(200)).body as {
      data: { code: string }[];
    };
    expect(seen.data.map((row) => row.code)).toContain('AURORA27');
    await investor.get(`/api/v1/issuances/${aurora}/invitations`).expect(403);

    await operator
      .delete(`/api/v1/issuances/${aurora}/invitations/${invitationId}`)
      .set('Idempotency-Key', key())
      .expect(200);
    const after = (await investor.get('/api/v1/issuances').expect(200)).body as {
      data: { code: string }[];
    };
    expect(after.data.map((row) => row.code)).not.toContain('AURORA27');
    expect(after.data.map((row) => row.code)).toContain('NWSD26');
    await investor.get(`/api/v1/issuances/${aurora}`).expect(404);

    await operator
      .post(`/api/v1/issuances/${aurora}/invitations`)
      .set('Idempotency-Key', key())
      .send({ investorId: alpine })
      .expect(201);
  });

  it('never shows a draft to an investor', async () => {
    const investor = await ctx.signIn('investor.b@example.com');
    const seen = (await investor.get('/api/v1/issuances?pageSize=100').expect(200)).body as {
      data: { status: string }[];
    };
    expect(seen.data.every((row) => !['DRAFT', 'UNDER_REVIEW'].includes(row.status))).toBe(true);
  });
});

describe('daily subscription auto-close', () => {
  it('closes the subscriptions past their end date, as the system', async () => {
    const debt = await idOf(`SELECT id FROM issuance.issuance WHERE code = 'NWSD26'`);
    await ctx.admin.query(
      `UPDATE issuance.issuance_terms SET subscription_end_date = current_date - 2 WHERE issuance_id = $1`,
      [debt],
    );
    expect(await ctx.app.get(SubscriptionAutoClose).run()).toBeGreaterThanOrEqual(1);
    const closed = await operator.get(`/api/v1/issuances/${debt}`).expect(200);
    expect((closed.body as IssuanceView).status).toBe('SUBSCRIPTION_CLOSED');
    const history = (await operator.get(`/api/v1/issuances/${debt}/transitions`).expect(200))
      .body as {
      toStatus: string;
      actorUserId: string | null;
    }[];
    expect(history.at(-1)).toMatchObject({ toStatus: 'SUBSCRIPTION_CLOSED', actorUserId: null });
  });
});
