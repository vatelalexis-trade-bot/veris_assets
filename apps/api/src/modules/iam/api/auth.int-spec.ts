// Authentication end to end against PostgreSQL and Redis (phase 5, docs/BACKLOG.md P5-1 to P5-7).
import { randomUUID } from 'node:crypto';
import type { ErrorResponseBody } from '@virtus/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startIntegrationApp, type IntegrationApp } from '../../../test/integration-app.js';

let ctx: IntegrationApp;
let password: string;

const OPERATOR = 'northwind.operator@example.com';
const AUDITOR = 'northwind.auditor@example.com';
const ADMIN = 'northwind.admin1@example.com';

const server = () => ctx.app.getHttpServer();
const errorCode = (response: request.Response) => (response.body as ErrorResponseBody).error.code;

const signedIn = (email: string) => ctx.signIn(email);

beforeAll(async () => {
  ctx = await startIntegrationApp();
  if (!ctx.env.DEMO_ACCOUNTS_PASSWORD) throw new Error('DEMO_ACCOUNTS_PASSWORD must be set');
  password = ctx.env.DEMO_ACCOUNTS_PASSWORD;
});

afterAll(async () => {
  await ctx.close();
});

describe('sign-in', () => {
  it('opens a session in a secure cookie and describes the user', async () => {
    const agent = request.agent(server());
    const response = await agent
      .post('/api/v1/auth/sign-in')
      .send({ email: OPERATOR, password })
      .expect(200);
    expect(response.body).toEqual({ status: 'SIGNED_IN' });
    const cookie = response.headers['set-cookie']?.[0] ?? '';
    expect(cookie).toMatch(/^va\.session_token=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);

    const me = await agent.get('/api/v1/auth/me').expect(200);
    expect(me.body).toMatchObject({
      user: { email: OPERATOR, locale: 'fr-FR' },
      tenant: { legalName: 'Northwind Asset Management SAS (demo)' },
      roles: ['ISSUER_OPERATOR'],
      homePortal: 'issuer',
      mfa: { enabled: false, required: false },
    });
  });

  it('refuses a wrong password with a generic error and audits it without the email', async () => {
    const response = await request(server())
      .post('/api/v1/auth/sign-in')
      .send({ email: OPERATOR, password: 'not the right password' })
      .expect(401);
    expect(errorCode(response)).toBe('INVALID_CREDENTIALS');
    const { rows } = await ctx.admin.query(
      `SELECT result, reason, row_to_json(a)::text AS row FROM audit.audit_event a
        WHERE action = 'AUTH_SIGN_IN' AND result = 'FAILED' ORDER BY occurred_at DESC LIMIT 1`,
    );
    expect(rows[0]).toMatchObject({ result: 'FAILED', reason: 'INVALID_CREDENTIALS' });
    expect(rows[0].row).not.toContain(OPERATOR);
  });

  it('gives the same error for an unknown account', async () => {
    const response = await request(server())
      .post('/api/v1/auth/sign-in')
      .send({ email: 'nobody@example.com', password: 'whatever password' })
      .expect(401);
    expect(errorCode(response)).toBe('INVALID_CREDENTIALS');
  });

  it('locks the account for 15 minutes after 5 failures, even with the right password', async () => {
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await request(server())
        .post('/api/v1/auth/sign-in')
        .send({ email: AUDITOR, password: 'wrong password!!' })
        .expect(401);
    }
    const locked = await request(server())
      .post('/api/v1/auth/sign-in')
      .send({ email: AUDITOR, password })
      .expect(423);
    expect(errorCode(locked)).toBe('ACCOUNT_LOCKED');
    await ctx.admin.query(
      `UPDATE iam.user SET locked_until = NULL, failed_login_count = 0 WHERE email = $1`,
      [AUDITOR],
    );
  });

  it('refuses a write request coming from another site (CSRF)', async () => {
    const response = await request(server())
      .post('/api/v1/auth/sign-in')
      .set('Origin', 'https://evil.example')
      .send({ email: OPERATOR, password })
      .expect(403);
    expect(errorCode(response)).toBe('PERMISSION_DENIED');
  });
});

describe('two-factor authentication', () => {
  it('asks administrators for a second factor before opening the session', async () => {
    const agent = request.agent(server());
    const first = await agent
      .post('/api/v1/auth/sign-in')
      .send({ email: ADMIN, password })
      .expect(200);
    expect(first.body).toEqual({ status: 'MFA_REQUIRED' });
    expect(errorCode(await agent.get('/api/v1/auth/me').expect(401))).toBe('UNAUTHENTICATED');

    const wrong = await agent.post('/api/v1/auth/mfa/verify').send({ code: '000000' }).expect(401);
    expect(errorCode(wrong)).toBe('MFA_INVALID_CODE');

    await agent
      .post('/api/v1/auth/mfa/verify')
      .send({ code: await ctx.totpCode(ADMIN) })
      .expect(200);
    const me = await agent.get('/api/v1/auth/me').expect(200);
    expect(me.body).toMatchObject({
      roles: ['ISSUER_ADMIN'],
      mfa: { enabled: true, required: true },
    });
  });
});

describe('sessions', () => {
  it('requires a session on every route that is not public', async () => {
    expect(errorCode(await request(server()).get('/api/v1/auth/me').expect(401))).toBe(
      'UNAUTHENTICATED',
    );
    await request(server()).get('/health').expect(200);
  });

  it('ends the session on sign-out', async () => {
    const agent = await signedIn(OPERATOR);
    await agent.post('/api/v1/auth/sign-out').expect(204);
    await agent.get('/api/v1/auth/me').expect(401);
  });
});

describe('invitations', () => {
  it('lets an administrator invite a user, who then chooses a password and is signed in', async () => {
    const adminAgent = await signedIn(ADMIN);
    const email = `new.operator.${Date.now()}@example.com`;
    await adminAgent
      .post('/api/v1/users/invitations')
      .set('Idempotency-Key', randomUUID())
      .send({ email, name: 'New Operator (demo)', roleCode: 'ISSUER_OPERATOR', locale: 'fr-FR' })
      .expect(201);
    const link = ctx.emails.lastLinkTo(email);
    expect(link).toContain('/fr/invitation/');
    const token = link.split('/').at(-1)!;

    const preview = await request(server()).get(`/api/v1/auth/invitations/${token}`).expect(200);
    expect(preview.body).toMatchObject({
      email,
      roleCode: 'ISSUER_OPERATOR',
      tenantName: 'Northwind Asset Management SAS (demo)',
    });

    const weak = await request(server())
      .post(`/api/v1/auth/invitations/${token}/accept`)
      .send({ password: 'qwerty123456' })
      .expect(422);
    expect((weak.body as ErrorResponseBody).error).toMatchObject({
      code: 'PASSWORD_TOO_WEAK',
      details: [{ code: 'PASSWORD_TOO_COMMON', field: 'password' }],
    });

    const invitee = request.agent(server());
    const accepted = await invitee
      .post(`/api/v1/auth/invitations/${token}/accept`)
      .send({ password: 'violet tractor under the moon' })
      .expect(200);
    expect(accepted.body).toEqual({ status: 'SIGNED_IN' });
    expect((await invitee.get('/api/v1/auth/me').expect(200)).body.roles).toEqual([
      'ISSUER_OPERATOR',
    ]);

    const reused = await request(server())
      .post(`/api/v1/auth/invitations/${token}/accept`)
      .send({ password: 'violet tractor under the moon' })
      .expect(422);
    expect(errorCode(reused)).toBe('INVITATION_INVALID_OR_EXPIRED');
  });

  it('answers 404 and audits a request that forces another tenant (SPEC §20, scenario 5)', async () => {
    const adminAgent = await signedIn(ADMIN);
    const email = `tenant.check.${Date.now()}@example.com`;
    const tenants = await ctx.admin.query<{ id: string; legal_name: string }>(
      `SELECT id, legal_name FROM iam.tenant`,
    );
    const contosoId = tenants.rows.find((row) => row.legal_name.startsWith('Contoso'))!.id;
    const northwindId = tenants.rows.find((row) => row.legal_name.startsWith('Northwind'))!.id;

    const forced = await adminAgent
      .post('/api/v1/users/invitations')
      .set('Idempotency-Key', randomUUID())
      .send({ email, name: 'Tenant Check (demo)', roleCode: 'AUDITOR', tenantId: contosoId })
      .expect(404);
    expect(errorCode(forced)).toBe('RESOURCE_NOT_FOUND');
    expect(
      (await ctx.admin.query(`SELECT 1 FROM iam.user_invitation WHERE email = $1`, [email]))
        .rowCount,
    ).toBe(0);
    await expect
      .poll(
        async () =>
          (
            await ctx.admin.query(
              `SELECT 1 FROM audit.audit_event WHERE action = 'TENANT_OVERRIDE_ATTEMPT'`,
            )
          ).rowCount,
      )
      .toBeGreaterThan(0);

    // Sending one's own tenant is harmless: it is ignored.
    await adminAgent
      .post('/api/v1/users/invitations')
      .set('Idempotency-Key', randomUUID())
      .send({ email, name: 'Tenant Check (demo)', roleCode: 'AUDITOR', tenantId: northwindId })
      .expect(201);
  });

  it('refuses invitations from users who are not administrators', async () => {
    const operator = await signedIn(OPERATOR);
    const response = await operator
      .post('/api/v1/users/invitations')
      .set('Idempotency-Key', randomUUID())
      .send({ email: 'x@example.com', name: 'X', roleCode: 'AUDITOR' })
      .expect(403);
    expect(errorCode(response)).toBe('PERMISSION_DENIED');
  });

  it('makes a new compliance officer set up two-factor authentication before anything else', async () => {
    const adminAgent = await signedIn(ADMIN);
    const email = `new.compliance.${Date.now()}@example.com`;
    await adminAgent
      .post('/api/v1/users/invitations')
      .set('Idempotency-Key', randomUUID())
      .send({ email, name: 'New Compliance (demo)', roleCode: 'COMPLIANCE_OFFICER' })
      .expect(201);
    const token = ctx.emails.lastLinkTo(email).split('/').at(-1)!;
    const officer = request.agent(server());
    const newPassword = 'amber lantern over the harbour';
    await officer
      .post(`/api/v1/auth/invitations/${token}/accept`)
      .send({ password: newPassword })
      .expect(200);

    const me = await officer.get('/api/v1/auth/me').expect(200);
    expect(me.body.mfa).toEqual({ enabled: false, required: true });
    const blocked = await officer
      .post('/api/v1/users/invitations')
      .set('Idempotency-Key', randomUUID())
      .send({ email: 'y@example.com', name: 'Y', roleCode: 'AUDITOR' })
      .expect(403);
    expect(errorCode(blocked)).toBe('MFA_ENROLLMENT_REQUIRED');

    const enrollment = await officer
      .post('/api/v1/auth/mfa/enroll')
      .send({ password: newPassword })
      .expect(200);
    expect(enrollment.body.backupCodes).toHaveLength(10);
    expect(enrollment.body.totpUri).toMatch(/^otpauth:\/\/totp\//);
    await officer
      .post('/api/v1/auth/mfa/confirm')
      .send({ code: await ctx.totpCode(email) })
      .expect(204);
    expect((await officer.get('/api/v1/auth/me').expect(200)).body.mfa).toEqual({
      enabled: true,
      required: true,
    });
  });
});

describe('password reset', () => {
  it('sends a one-time link that sets a new password', async () => {
    const email = 'investor.c@example.com';
    await request(server()).post('/api/v1/auth/password/forgot').send({ email }).expect(202);
    const link = ctx.emails.lastLinkTo(email);
    const token = new URL(link).searchParams.get('token')!;

    const weak = await request(server())
      .post('/api/v1/auth/password/reset')
      .send({ token, newPassword: 'short' })
      .expect(422);
    expect(errorCode(weak)).toBe('PASSWORD_TOO_WEAK');

    const newPassword = 'copper kettle in the winter garden';
    await request(server())
      .post('/api/v1/auth/password/reset')
      .send({ token, newPassword })
      .expect(204);
    await request(server())
      .post('/api/v1/auth/sign-in')
      .send({ email, password: newPassword })
      .expect(200);
    await request(server()).post('/api/v1/auth/sign-in').send({ email, password }).expect(401);

    const reused = await request(server())
      .post('/api/v1/auth/password/reset')
      .send({ token, newPassword: 'another fresh passphrase here' })
      .expect(422);
    expect(errorCode(reused)).toBe('RESET_TOKEN_INVALID_OR_EXPIRED');

    // The demo password is set back (every demo account shares it): other test files sign this
    // account in.
    await ctx.admin.query(
      `UPDATE iam.account SET password = (
         SELECT a.password FROM iam.account a JOIN iam.user u ON u.id = a.user_id
         WHERE u.email = 'investor.b@example.com' AND a.provider_id = 'credential')
       WHERE provider_id = 'credential'
         AND user_id = (SELECT id FROM iam.user WHERE email = $1)`,
      [email],
    );
    await request(server()).post('/api/v1/auth/sign-in').send({ email, password }).expect(200);
  });

  it('answers the same way for an unknown email, without sending anything', async () => {
    const before = ctx.emails.messages.length;
    await request(server())
      .post('/api/v1/auth/password/forgot')
      .send({ email: 'unknown@example.com' })
      .expect(202);
    expect(ctx.emails.messages.length).toBe(before);
  });
});

describe('demonstration accounts (D-016)', () => {
  it('lists the demo accounts with the current code of those using two-factor authentication', async () => {
    const response = await request(server()).get('/api/v1/auth/demo-accounts').expect(200);
    expect(response.body.password).toBe(password);
    const withCodes = (response.body.accounts as { totpCode: string | null }[]).filter(
      (account) => account.totpCode,
    );
    expect(response.body.accounts.length).toBeGreaterThanOrEqual(11);
    expect(withCodes).toHaveLength(5);
  });
});
