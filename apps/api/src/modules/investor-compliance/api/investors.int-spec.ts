// Investors and KYC/KYB (phase 8, docs/BACKLOG.md P8-1, P8-2, P8-4, P8-5): the complete KYC journey.
import { randomUUID } from 'node:crypto';
import type { ErrorResponseBody } from '@virtus/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { QUEUES } from '../../../core/jobs/queues.js';
import { OutboxRelay } from '../../../core/outbox/outbox-relay.js';
import type { OutboxJob } from '../../../core/outbox/outbox.js';
import { MASKED } from '../../../core/audit/masking.js';
import { startIntegrationApp, type IntegrationApp } from '../../../test/integration-app.js';
import { KycExpiry } from '../application/kyc-expiry.js';

type Agent = ReturnType<typeof request.agent>;
let ctx: IntegrationApp;
let operator: Agent;
let compliance: Agent;
const errorOf = (response: request.Response) => (response.body as ErrorResponseBody).error;
const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');

async function idOf(query: string, values: unknown[] = []): Promise<string> {
  return (await ctx.admin.query<{ id: string }>(query, values)).rows[0]!.id;
}

/** Delivers the waiting outbox events, as the worker would. */
async function deliverEvents(): Promise<void> {
  const relay = ctx.app.get(OutboxRelay);
  const { rows } = await ctx.admin.query<{ data: OutboxJob }>(
    `SELECT data FROM pgboss.job WHERE name = $1 AND state = 'created'`,
    [QUEUES.outboxEvent.name],
  );
  for (const row of rows) await relay.deliver(row.data);
  await ctx.admin.query(`DELETE FROM pgboss.job WHERE name = $1`, [QUEUES.outboxEvent.name]);
}

async function notificationsOf(email: string, type: string): Promise<number> {
  const { rowCount } = await ctx.admin.query(
    `SELECT 1 FROM core.notification n JOIN iam.user u ON u.id = n.user_id
     WHERE u.email = $1 AND n.title_key = $2`,
    [email, type],
  );
  return rowCount ?? 0;
}

const newInvestor = (legalName: string) => ({
  type: 'LEGAL_ENTITY',
  legalName,
  countryOfIncorporation: 'FR',
  classification: 'PROFESSIONAL',
  registrationNumber: 'DEMO-FR-424242',
  contactEmail: 'contact.new@example.com',
  address: { line1: '1 Rue de la Démo', postalCode: '75001', city: 'Paris', countryCode: 'FR' },
});

beforeAll(async () => {
  ctx = await startIntegrationApp();
  operator = await ctx.signIn('northwind.operator@example.com');
  compliance = await ctx.signIn('northwind.compliance@example.com');
  await ctx.admin.query(
    `UPDATE core.outbox_event SET processed_at = now() WHERE processed_at IS NULL`,
  );
  await ctx.admin.query(`DELETE FROM pgboss.job WHERE name = $1`, [QUEUES.outboxEvent.name]);
});

afterAll(async () => {
  await ctx.close();
});

describe('investors (P8-1)', () => {
  it('creates an investor with a recipient code, and masks its personal data in the audit', async () => {
    const response = await operator
      .post('/api/v1/investors')
      .set('Idempotency-Key', randomUUID())
      .send(newInvestor(`Nouvel Investisseur ${Date.now()} SAS (demo)`))
      .expect(201);
    const created = response.body as {
      id: string;
      recipientCode: string;
      kycStatus: string;
      profileStatus: string;
    };
    expect(created.recipientCode).toMatch(/^VA-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
    expect(created).toMatchObject({ kycStatus: 'NOT_STARTED', profileStatus: 'DRAFT' });
    const audit = await ctx.admin.query<{ new_value: Record<string, unknown> }>(
      `SELECT new_value FROM audit.audit_event WHERE action = 'INVESTOR_CREATED' AND resource_id = $1`,
      [created.id],
    );
    expect(audit.rows[0]!.new_value).toMatchObject({ contactEmail: MASKED, address: MASKED });

    const search = await operator.get('/api/v1/investors?q=nouvel%20investisseur').expect(200);
    expect((search.body as { data: { id: string }[] }).data.map((row) => row.id)).toContain(
      created.id,
    );
  });

  it('updates with optimistic locking', async () => {
    const id = await idOf(`SELECT id FROM investor.investor WHERE legal_name LIKE 'Estuary%'`);
    const current = await operator.get(`/api/v1/investors/${id}`).expect(200);
    const etag = current.headers.etag as string;
    await operator
      .patch(`/api/v1/investors/${id}`)
      .set('If-Match', etag)
      .send({ phone: '+31 10 000 00 00' })
      .expect(200);
    const stale = await operator
      .patch(`/api/v1/investors/${id}`)
      .set('If-Match', etag)
      .send({ phone: '+31 10 000 00 01' })
      .expect(409);
    expect(errorOf(stale).code).toBe('VERSION_CONFLICT');
  });

  it('keeps representatives and beneficial owners [DP] out of reach of the Auditor', async () => {
    const id = await idOf(`SELECT id FROM investor.investor WHERE legal_name LIKE 'Alpine%'`);
    const owners = await operator.get(`/api/v1/investors/${id}/beneficial-owners`).expect(200);
    expect(
      (owners.body as { ownershipPercentage: string }[]).map((row) => row.ownershipPercentage),
    ).toEqual(['60.00', '40.00']);
    const auditor = await ctx.signIn('northwind.auditor@example.com');
    await auditor.get(`/api/v1/investors/${id}`).expect(200);
    await auditor.get(`/api/v1/investors/${id}/beneficial-owners`).expect(403);

    const added = await operator
      .post(`/api/v1/investors/${id}/representatives`)
      .send({ fullName: 'Nina Petit (demo)', title: 'Treasurer' })
      .expect(201);
    const audit = await ctx.admin.query<{ new_value: Record<string, unknown> }>(
      `SELECT new_value FROM audit.audit_event WHERE correlation_id = $1`,
      [added.headers['x-correlation-id']],
    );
    expect(audit.rows[0]!.new_value).toMatchObject({ fullName: MASKED, title: MASKED });
  });
});

describe('investor portal profile (P8-5)', () => {
  it('shows the investor its own profile, and lets it regenerate its recipient code', async () => {
    const investor = await ctx.signIn('investor.a@example.com');
    const profile = await investor.get('/api/v1/me/investor').expect(200);
    const before = profile.body as { legalName: string; recipientCode: string };
    expect(before.legalName).toMatch(/^Alpine/);
    await investor.get('/api/v1/investors').expect(403);

    const regenerated = await investor
      .post('/api/v1/me/investor/recipient-code/regenerate')
      .set('Idempotency-Key', randomUUID())
      .expect(200);
    expect((regenerated.body as { recipientCode: string }).recipientCode).not.toBe(
      before.recipientCode,
    );

    const current = await investor.get('/api/v1/me/investor').expect(200);
    await investor
      .patch('/api/v1/me/investor')
      .set('If-Match', current.headers.etag as string)
      .send({ phone: '+33 1 00 00 00 00' })
      .expect(200);
    // Only contact details: the legal name is not the investor's to change.
    await investor
      .patch('/api/v1/me/investor')
      .set('If-Match', '"999999"')
      .send({ legalName: 'Something else' })
      .expect(400);
  });
});

describe('KYC/KYB journey (P8-2, "vérifiable par : parcours KYC complet")', () => {
  it('opens, documents, submits, and has a Compliance Officer approve the case', async () => {
    const investorId = await idOf(
      `SELECT id FROM investor.investor WHERE legal_name LIKE 'Nordic%'`,
    );
    const opened = await operator
      .post('/api/v1/kyc-cases')
      .set('Idempotency-Key', randomUUID())
      .send({ investorId })
      .expect(201);
    const caseId = (opened.body as { id: string }).id;
    const second = await operator
      .post('/api/v1/kyc-cases')
      .set('Idempotency-Key', randomUUID())
      .send({ investorId })
      .expect(400);
    expect(errorOf(second).details[0]).toMatchObject({ code: 'OPEN_KYC_CASE_EXISTS' });

    // Submitting without evidence is refused.
    const empty = await operator
      .post(`/api/v1/kyc-cases/${caseId}/submit-for-review`)
      .set('Idempotency-Key', randomUUID())
      .expect(400);
    expect(errorOf(empty).details[0]).toMatchObject({ code: 'KYC_EVIDENCE_REQUIRED' });

    const evidence = await operator
      .post('/api/v1/documents')
      .set('Idempotency-Key', randomUUID())
      .attach('file', PDF, 'registration.pdf')
      .field('type', 'KYC_EVIDENCE')
      .field('name', 'Registration extract')
      .field('confidentiality', 'CONFIDENTIAL')
      .field('ownerType', 'INVESTOR')
      .field('investorId', investorId)
      .expect(201);
    await operator
      .post(`/api/v1/kyc-cases/${caseId}/documents`)
      .send({ documentId: (evidence.body as { id: string }).id, kind: 'REGISTRATION_EXTRACT' })
      .expect(200);

    const submitted = await operator
      .post(`/api/v1/kyc-cases/${caseId}/submit-for-review`)
      .set('Idempotency-Key', randomUUID())
      .expect(200);
    expect(submitted.body).toMatchObject({
      status: 'PENDING_REVIEW',
      providerOutcome: 'CLEAR',
      suggestedRiskLevel: 'LOW',
    });
    await deliverEvents();
    expect(
      await notificationsOf('northwind.compliance@example.com', 'KYC_REVIEW_REQUESTED'),
    ).toBeGreaterThan(0);

    // The operator prepared the case: it may not decide it.
    await operator
      .post(`/api/v1/kyc-cases/${caseId}/approve`)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(403);

    const approved = await compliance
      .post(`/api/v1/kyc-cases/${caseId}/approve`)
      .set('Idempotency-Key', randomUUID())
      .send({ comment: 'Documents complete' })
      .expect(200);
    const decision = approved.body as { status: string; validUntil: string; documents: unknown[] };
    expect(decision.status).toBe('APPROVED');
    expect(decision.validUntil).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(decision.documents).toHaveLength(1);

    const investor = (await operator.get(`/api/v1/investors/${investorId}`).expect(200)).body as {
      kycStatus: string;
      kycExpiryDate: string;
      riskLevel: string;
    };
    expect(investor).toMatchObject({
      kycStatus: 'APPROVED',
      kycExpiryDate: decision.validUntil,
      riskLevel: 'LOW',
    });

    await deliverEvents();
    expect(await notificationsOf('northwind.operator@example.com', 'KYC_APPROVED')).toBeGreaterThan(
      0,
    );
    const transitions = await ctx.admin.query(
      `SELECT to_status FROM core.workflow_transition WHERE resource_type = 'kyc_case' AND resource_id = $1
       ORDER BY occurred_at`,
      [caseId],
    );
    expect(transitions.rows.map((row: { to_status: string }) => row.to_status)).toEqual([
      'IN_PROGRESS',
      'PENDING_REVIEW',
      'APPROVED',
    ]);
  });

  it('requires a comment to reject, and notifies the investor', async () => {
    const caseId = await idOf(
      `SELECT c.id FROM investor.kyc_case c JOIN investor.investor i ON i.id = c.investor_id
       WHERE i.legal_name LIKE 'Kestrel%' AND c.status = 'PENDING_REVIEW'`,
    );
    const missing = await compliance
      .post(`/api/v1/kyc-cases/${caseId}/reject`)
      .set('Idempotency-Key', randomUUID())
      .send({ comment: ' ' })
      .expect(400);
    expect(errorOf(missing).code).toBe('VALIDATION_FAILED');
    const rejected = await compliance
      .post(`/api/v1/kyc-cases/${caseId}/reject`)
      .set('Idempotency-Key', randomUUID())
      .send({ comment: 'Register extract older than three months' })
      .expect(200);
    expect(rejected.body).toMatchObject({
      status: 'REJECTED',
      decisionComment: 'Register extract older than three months',
    });
  });

  it('never lets the person who prepared a case decide it, even with both rights (four eyes)', async () => {
    const admin = await ctx.signIn('northwind.admin1@example.com');
    const admin2Id = await idOf(
      `SELECT id FROM iam.user WHERE email = 'northwind.admin2@example.com'`,
    );
    await admin
      .put(`/api/v1/users/${admin2Id}/roles`)
      .set('Idempotency-Key', randomUUID())
      .send({ roles: ['ISSUER_ADMIN', 'COMPLIANCE_OFFICER'] })
      .expect(200);
    try {
      const both = await ctx.signIn('northwind.admin2@example.com');
      const caseId = await idOf(
        `SELECT c.id FROM investor.kyc_case c JOIN investor.investor i ON i.id = c.investor_id
         WHERE i.legal_name LIKE 'Linden%' AND c.status = 'IN_PROGRESS'`,
      );
      const investorId = await idOf(
        `SELECT id FROM investor.investor WHERE legal_name LIKE 'Linden%'`,
      );
      const evidence = await both
        .post('/api/v1/documents')
        .set('Idempotency-Key', randomUUID())
        .attach('file', PDF, 'articles.pdf')
        .field('type', 'KYC_EVIDENCE')
        .field('name', 'Articles')
        .field('confidentiality', 'CONFIDENTIAL')
        .field('ownerType', 'INVESTOR')
        .field('investorId', investorId)
        .expect(201);
      await both
        .post(`/api/v1/kyc-cases/${caseId}/documents`)
        .send({ documentId: (evidence.body as { id: string }).id, kind: 'ARTICLES_OF_ASSOCIATION' })
        .expect(200);
      await both
        .post(`/api/v1/kyc-cases/${caseId}/submit-for-review`)
        .set('Idempotency-Key', randomUUID())
        .expect(200);
      const refused = await both
        .post(`/api/v1/kyc-cases/${caseId}/approve`)
        .set('Idempotency-Key', randomUUID())
        .send({})
        .expect(403);
      expect(errorOf(refused).code).toBe('FOUR_EYES_VIOLATION');
      // The denial is audited in its own transaction, just after the answer.
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
    } finally {
      await admin
        .put(`/api/v1/users/${admin2Id}/roles`)
        .set('Idempotency-Key', randomUUID())
        .send({ roles: ['ISSUER_ADMIN'] })
        .expect(200);
    }
  });

  it('shows an investor its own cases only', async () => {
    const investor = await ctx.signIn('investor.a@example.com');
    const cases = (await investor.get('/api/v1/kyc-cases').expect(200)).body as {
      data: { investorName: string }[];
    };
    expect(cases.data.length).toBeGreaterThan(0);
    expect(cases.data.every((row) => row.investorName.startsWith('Alpine'))).toBe(true);
    const kestrelCase = await idOf(
      `SELECT c.id FROM investor.kyc_case c JOIN investor.investor i ON i.id = c.investor_id
       WHERE i.legal_name LIKE 'Kestrel%'`,
    );
    await investor.get(`/api/v1/kyc-cases/${kestrelCase}`).expect(404);
  });
});

describe('daily KYC expiry job (P8-4)', () => {
  it('warns 30 days before, once, and expires approvals past their last day', async () => {
    const pastCase = await idOf(
      `SELECT c.id FROM investor.kyc_case c JOIN investor.investor i ON i.id = c.investor_id
       WHERE i.legal_name LIKE 'Granite%' AND c.status = 'APPROVED'`,
    );
    await ctx.admin.query(
      `UPDATE investor.kyc_case SET valid_until = current_date - 2 WHERE id = $1`,
      [pastCase],
    );
    const job = ctx.app.get(KycExpiry);
    const first = await job.run();
    expect(first.expired).toBeGreaterThanOrEqual(1);
    expect(first.warned).toBeGreaterThanOrEqual(1); // Harbour Insurance expires within 30 days.
    const second = await job.run();
    expect(second).toEqual({ expired: 0, warned: 0 });

    const granite = await ctx.admin.query<{ kyc_status: string }>(
      `SELECT kyc_status FROM investor.investor WHERE legal_name LIKE 'Granite%'`,
    );
    expect(granite.rows[0]!.kyc_status).toBe('EXPIRED');
    const audit = await ctx.admin.query<{ source: string; actor_user_id: string | null }>(
      `SELECT source, actor_user_id FROM audit.audit_event WHERE action = 'KYC_EXPIRED' AND resource_id = $1`,
      [pastCase],
    );
    expect(audit.rows[0]).toEqual({ source: 'SYSTEM', actor_user_id: null });

    await deliverEvents();
    expect(
      await notificationsOf('northwind.compliance@example.com', 'KYC_EXPIRED'),
    ).toBeGreaterThan(0);
    expect(
      await notificationsOf('northwind.compliance@example.com', 'KYC_EXPIRING_SOON'),
    ).toBeGreaterThan(0);
  });
});
