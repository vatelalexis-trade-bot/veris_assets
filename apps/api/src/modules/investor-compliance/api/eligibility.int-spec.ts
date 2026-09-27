// Eligibility engine and decisions (phase 9, docs/BACKLOG.md P9-2 and P9-4): scenario 2 of SPEC §29
// for its eligibility part (the subscription attempt itself is completed in phase 11).
import { randomUUID } from 'node:crypto';
import type { ErrorResponseBody } from '@veris/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DATABASE, type Database, withTenantTransaction } from '../../../core/database/database.js';
import { startIntegrationApp, type IntegrationApp } from '../../../test/integration-app.js';
import { EligibilityService } from '../application/eligibility.service.js';
import type { EligibilityRuleSet } from '../domain/eligibility.js';

type Agent = ReturnType<typeof request.agent>;
let ctx: IntegrationApp;
let compliance: Agent;
const errorOf = (response: request.Response) => (response.body as ErrorResponseBody).error;

/** Rules of the demo solar issuance (phase 10): professionals, KYC valid 90 days, no US investor. */
const solarRules: EligibilityRuleSet = {
  professionalOnly: true,
  allowedCountries: [],
  excludedCountries: ['US'],
  allowedInvestorTypes: ['LEGAL_ENTITY'],
  allowedClassifications: [],
  kycRequired: true,
  kycMinRemainingValidityDays: 90,
  maxInvestors: 50,
  rulesVersion: 1,
};

async function investorId(prefix: string): Promise<{ id: string; tenantId: string }> {
  const { rows } = await ctx.admin.query<{ id: string; tenant_id: string }>(
    `SELECT id, tenant_id FROM investor.investor WHERE legal_name LIKE $1`,
    [`${prefix}%`],
  );
  return { id: rows[0]!.id, tenantId: rows[0]!.tenant_id };
}

async function assessmentsOf(id: string): Promise<number> {
  const { rowCount } = await ctx.admin.query(
    `SELECT 1 FROM investor.eligibility_assessment WHERE investor_id = $1`,
    [id],
  );
  return rowCount ?? 0;
}

type Rule = { code: string; passed: boolean; detail?: Record<string, unknown> };
const failed = (rules: Rule[]) => rules.filter((rule) => !rule.passed).map((rule) => rule.code);

beforeAll(async () => {
  ctx = await startIntegrationApp();
  compliance = await ctx.signIn('northwind.compliance@example.com');
});

afterAll(async () => {
  await ctx.close();
});

describe('scenario 2 — investor not eligible (SPEC §29, eligibility part)', () => {
  it('refuses an investor whose country is excluded, with COUNTRY_EXCLUDED and the country', async () => {
    const juniper = await investorId('Juniper');
    const before = await assessmentsOf(juniper.id);
    const response = await compliance
      .post('/api/v1/eligibility-assessments/preview')
      .send({ investorId: juniper.id, ruleSet: solarRules })
      .expect(200);
    const result = response.body as { result: string; rules: Rule[] };
    expect(result.result).toBe('NOT_ELIGIBLE');
    expect(failed(result.rules)).toEqual(['COUNTRY_EXCLUDED']);
    expect(result.rules.find((rule) => rule.code === 'COUNTRY_EXCLUDED')?.detail).toEqual({
      country: 'US',
    });
    // A preview records nothing.
    expect(await assessmentsOf(juniper.id)).toBe(before);
  });

  it('refuses an investor whose KYC/KYB has expired, with KYC_EXPIRED', async () => {
    const iris = await investorId('Iris');
    const response = await compliance
      .post('/api/v1/eligibility-assessments/preview')
      .send({ investorId: iris.id, ruleSet: solarRules })
      .expect(200);
    expect(failed((response.body as { rules: Rule[] }).rules)).toEqual(['KYC_EXPIRED']);
  });

  it('records the decision taken at subscription time, and audits it with the failed rule', async () => {
    const juniper = await investorId('Juniper');
    const service = ctx.app.get(EligibilityService);
    const db = ctx.app.get<Database>(DATABASE);
    const { assessment, result } = await withTenantTransaction(db, juniper.tenantId, (tx) =>
      service.assess(tx, juniper.tenantId, {
        investorId: juniper.id,
        ruleSet: solarRules,
        context: 'SUBSCRIPTION',
        currentInvestorCount: 3,
      }),
    );
    expect(result.result).toBe('NOT_ELIGIBLE');
    expect(assessment).toMatchObject({
      context: 'SUBSCRIPTION',
      result: 'NOT_ELIGIBLE',
      decidedBySystem: true,
      rulesVersion: 'engine-1/rules-1',
    });
    const audit = await ctx.admin.query<{ reason: string }>(
      `SELECT reason FROM audit.audit_event WHERE action = 'ELIGIBILITY_ASSESSED' AND resource_id = $1`,
      [juniper.id],
    );
    expect(audit.rows[0]!.reason).toBe('COUNTRY_EXCLUDED');

    const detail = await compliance
      .get(`/api/v1/eligibility-assessments/${assessment.id}`)
      .expect(200);
    expect(detail.body).toMatchObject({
      context: 'SUBSCRIPTION',
      ruleSet: solarRules,
      result: 'NOT_ELIGIBLE',
    });
    await expect(
      ctx.admin.query(
        `UPDATE investor.eligibility_assessment SET result = 'ELIGIBLE' WHERE id = $1`,
        [assessment.id],
      ),
    ).rejects.toThrow(/append-only/);
  });

  it('finds an investor meeting every rule eligible', async () => {
    const alpine = await investorId('Alpine');
    const response = await compliance
      .post('/api/v1/eligibility-assessments/preview')
      .send({ investorId: alpine.id, ruleSet: solarRules })
      .expect(200);
    expect(response.body).toMatchObject({ result: 'ELIGIBLE', rulesVersion: 'engine-1/rules-1' });
  });
});

describe('eligibility status decided by a Compliance Officer (P9-2)', () => {
  it('suspends an investor with a justification, records the decision and blocks every issuance', async () => {
    const fjord = await investorId('Fjord');
    const missing = await compliance
      .post(`/api/v1/investors/${fjord.id}/eligibility-status`)
      .set('Idempotency-Key', randomUUID())
      .send({ status: 'SUSPENDED', justification: '' })
      .expect(400);
    expect(errorOf(missing).code).toBe('VALIDATION_FAILED');

    const suspended = await compliance
      .post(`/api/v1/investors/${fjord.id}/eligibility-status`)
      .set('Idempotency-Key', randomUUID())
      .send({ status: 'SUSPENDED', justification: 'Adverse media under review (demo)' })
      .expect(200);
    expect((suspended.body as { eligibilityStatus: string }).eligibilityStatus).toBe('SUSPENDED');

    const again = await compliance
      .post(`/api/v1/investors/${fjord.id}/eligibility-status`)
      .set('Idempotency-Key', randomUUID())
      .send({ status: 'SUSPENDED', justification: 'Twice' })
      .expect(409);
    expect(errorOf(again).code).toBe('INVALID_STATE_TRANSITION');

    const history = await compliance
      .get(`/api/v1/eligibility-assessments?investorId=${fjord.id}&context=MANUAL`)
      .expect(200);
    const [manual] = (
      history.body as {
        data: { result: string; justification: string; decidedBySystem: boolean }[];
      }
    ).data;
    expect(manual).toMatchObject({
      result: 'NOT_ELIGIBLE',
      justification: 'Adverse media under review (demo)',
      decidedBySystem: false,
    });

    const preview = await compliance
      .post('/api/v1/eligibility-assessments/preview')
      .send({ investorId: fjord.id, ruleSet: solarRules })
      .expect(200);
    expect(failed((preview.body as { rules: Rule[] }).rules)).toEqual(['INVESTOR_SUSPENDED']);

    await compliance
      .post(`/api/v1/investors/${fjord.id}/eligibility-status`)
      .set('Idempotency-Key', randomUUID())
      .send({ status: 'ELIGIBLE', justification: 'Review closed, nothing found (demo)' })
      .expect(200);
  });

  it('lets the Auditor read the decisions but not take them', async () => {
    const auditor = await ctx.signIn('northwind.auditor@example.com');
    await auditor.get('/api/v1/eligibility-assessments').expect(200);
    const alpine = await investorId('Alpine');
    await auditor
      .post(`/api/v1/investors/${alpine.id}/eligibility-status`)
      .set('Idempotency-Key', randomUUID())
      .send({ status: 'SUSPENDED', justification: 'Not allowed' })
      .expect(403);
  });

  it('never evaluates an investor of another tenant', async () => {
    const quarry = await investorId('Quarry');
    await compliance
      .post('/api/v1/eligibility-assessments/preview')
      .send({ investorId: quarry.id, ruleSet: solarRules })
      .expect(404);
  });
});
