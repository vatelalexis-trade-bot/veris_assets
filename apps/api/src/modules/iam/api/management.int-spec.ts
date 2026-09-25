// Tenant, user, role and settings management (phase 6, docs/BACKLOG.md P6-3).
import { randomUUID } from 'node:crypto';
import type { ErrorResponseBody } from '@virtus/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startIntegrationApp, type IntegrationApp } from '../../../test/integration-app.js';

let ctx: IntegrationApp;
const errorOf = (response: request.Response) => (response.body as ErrorResponseBody).error;

beforeAll(async () => {
  ctx = await startIntegrationApp();
});

afterAll(async () => {
  await ctx.close();
});

describe('tenants (Platform Administrator)', () => {
  it('creates a tenant and invites its first administrator by email (SPEC §6.1)', async () => {
    const platform = await ctx.signIn('platform.admin@example.com');
    const email = `first.admin.${Date.now()}@example.com`;
    const created = await platform
      .post('/api/v1/tenants')
      .set('Idempotency-Key', randomUUID())
      .send({
        legalName: 'Fabrikam Capital SAS (demo)',
        countryCode: 'FR',
        baseCurrency: 'EUR',
        organizationType: 'ASSET_MANAGER',
        firstAdministrator: { email, name: 'Fabrikam Admin (demo)', locale: 'fr-FR' },
      })
      .expect(201);
    expect(created.body).toMatchObject({
      legalName: 'Fabrikam Capital SAS (demo)',
      status: 'ACTIVE',
      version: 1,
    });
    expect(ctx.emails.lastLinkTo(email)).toContain('/fr/invitation/');

    const list = await platform.get('/api/v1/tenants?q=fabrikam').expect(200);
    expect(list.body.meta.total).toBe(1);
  });

  it('updates a tenant with optimistic locking (If-Match)', async () => {
    const platform = await ctx.signIn('platform.admin@example.com');
    const { body } = await platform.get('/api/v1/tenants?q=fabrikam').expect(200);
    const tenant = body.data[0];
    expect(
      errorOf(
        await platform
          .patch(`/api/v1/tenants/${tenant.id}`)
          .send({ tradeName: 'Fabrikam' })
          .expect(428),
      ).code,
    ).toBe('PRECONDITION_REQUIRED');
    const updated = await platform
      .patch(`/api/v1/tenants/${tenant.id}`)
      .set('If-Match', `"${tenant.version}"`)
      .send({ tradeName: 'Fabrikam' })
      .expect(200);
    expect(updated.body).toMatchObject({ tradeName: 'Fabrikam', version: tenant.version + 1 });
    expect(updated.headers.etag).toBe(`"${tenant.version + 1}"`);
    const stale = await platform
      .patch(`/api/v1/tenants/${tenant.id}`)
      .set('If-Match', `"${tenant.version}"`)
      .send({ tradeName: 'Old' })
      .expect(409);
    expect(errorOf(stale).code).toBe('VERSION_CONFLICT');
  });

  it('blocks the users of a deactivated tenant at once, and lets them back after reactivation', async () => {
    const platform = await ctx.signIn('platform.admin@example.com');
    const contosoOperator = await ctx.signIn('contoso.operator@example.com');
    const contosoId = (
      await ctx.admin.query<{ id: string }>(
        `SELECT id FROM iam.tenant WHERE legal_name LIKE 'Contoso%'`,
      )
    ).rows[0]!.id;

    await platform
      .post(`/api/v1/tenants/${contosoId}/deactivate`)
      .set('Idempotency-Key', randomUUID())
      .expect(200);
    await contosoOperator.get('/api/v1/auth/me').expect(401);
    const refused = await request(ctx.app.getHttpServer())
      .post('/api/v1/auth/sign-in')
      .send({ email: 'contoso.operator@example.com', password: ctx.env.DEMO_ACCOUNTS_PASSWORD })
      .expect(403);
    expect(errorOf(refused).code).toBe('ACCOUNT_INACTIVE');

    await platform
      .post(`/api/v1/tenants/${contosoId}/activate`)
      .set('Idempotency-Key', randomUUID())
      .expect(200);
    await ctx.signIn('contoso.operator@example.com');
  });

  it('keeps business data out of reach of the Platform Administrator (SPEC §4.1)', async () => {
    const platform = await ctx.signIn('platform.admin@example.com');
    expect(errorOf(await platform.get('/api/v1/users').expect(403)).code).toBe('PERMISSION_DENIED');
  });
});

describe('users of the organisation (Issuer Administrator)', () => {
  it('changes the roles of a user, which ends that user’s sessions (D-003)', async () => {
    const admin = await ctx.signIn('northwind.admin1@example.com');
    const auditor = await ctx.signIn('northwind.auditor@example.com');
    const users = (await admin.get('/api/v1/users').expect(200)).body as {
      id: string;
      email: string;
    }[];
    const auditorId = users.find((user) => user.email === 'northwind.auditor@example.com')!.id;

    const changed = await admin
      .put(`/api/v1/users/${auditorId}/roles`)
      .set('Idempotency-Key', randomUUID())
      .send({ roles: ['AUDITOR', 'ISSUER_OPERATOR'] })
      .expect(200);
    expect(changed.body.roles.sort()).toEqual(['AUDITOR', 'ISSUER_OPERATOR']);
    await auditor.get('/api/v1/auth/me').expect(401);

    await admin
      .put(`/api/v1/users/${auditorId}/roles`)
      .set('Idempotency-Key', randomUUID())
      .send({ roles: ['AUDITOR'] })
      .expect(200);
  });

  it('refuses roles an Issuer Administrator may not give', async () => {
    const admin = await ctx.signIn('northwind.admin1@example.com');
    const users = (await admin.get('/api/v1/users').expect(200)).body as {
      id: string;
      email: string;
    }[];
    const operatorId = users.find((user) => user.email === 'northwind.operator@example.com')!.id;
    const response = await admin
      .put(`/api/v1/users/${operatorId}/roles`)
      .set('Idempotency-Key', randomUUID())
      .send({ roles: ['PLATFORM_ADMIN'] })
      .expect(400);
    expect(errorOf(response).details[0]).toMatchObject({ code: 'ROLE_NOT_ASSIGNABLE' });
  });

  it('never lets administrators change their own account', async () => {
    const admin = await ctx.signIn('northwind.admin1@example.com');
    const me = (await admin.get('/api/v1/auth/me').expect(200)).body as { user: { id: string } };
    const response = await admin
      .post(`/api/v1/users/${me.user.id}/deactivate`)
      .set('Idempotency-Key', randomUUID())
      .expect(400);
    expect(errorOf(response).details[0]).toMatchObject({ code: 'OWN_ACCOUNT' });
  });

  it('deactivates and reactivates a user', async () => {
    const admin = await ctx.signIn('northwind.admin1@example.com');
    const users = (await admin.get('/api/v1/users').expect(200)).body as {
      id: string;
      email: string;
    }[];
    const investorId = users.find((user) => user.email === 'investor.b@example.com')!.id;
    const investor = await ctx.signIn('investor.b@example.com');

    expect(
      (
        await admin
          .post(`/api/v1/users/${investorId}/deactivate`)
          .set('Idempotency-Key', randomUUID())
          .expect(200)
      ).body.status,
    ).toBe('INACTIVE');
    await investor.get('/api/v1/auth/me').expect(401);
    expect(
      (
        await admin
          .post(`/api/v1/users/${investorId}/reactivate`)
          .set('Idempotency-Key', randomUUID())
          .expect(200)
      ).body.status,
    ).toBe('ACTIVE');
    await ctx.signIn('investor.b@example.com');
  });

  it('lists the permissions of the signed-in user for the web app menus', async () => {
    const auditor = await ctx.signIn('northwind.auditor@example.com');
    const me = (await auditor.get('/api/v1/auth/me').expect(200)).body as {
      permissions: Record<string, string>;
    };
    expect(me.permissions['audit:read']).toBe('all');
    expect(me.permissions['user:manage']).toBeUndefined();
  });
});

describe('organisation settings', () => {
  it('updates the organisation’s own settings with optimistic locking', async () => {
    const admin = await ctx.signIn('northwind.admin1@example.com');
    const current = await admin.get('/api/v1/settings').expect(200);
    expect(current.body.legalName).toMatch(/^Northwind/);
    const updated = await admin
      .patch('/api/v1/settings')
      .set('If-Match', current.headers.etag as string)
      .send({ timezone: 'Europe/Luxembourg' })
      .expect(200);
    expect(updated.body.timezone).toBe('Europe/Luxembourg');
    const invalid = await admin
      .patch('/api/v1/settings')
      .set('If-Match', updated.headers.etag as string)
      .send({ timezone: 'Mars/Olympus' })
      .expect(400);
    expect(errorOf(invalid).code).toBe('VALIDATION_FAILED');
    await admin
      .patch('/api/v1/settings')
      .set('If-Match', updated.headers.etag as string)
      .send({ timezone: 'Europe/Paris' })
      .expect(200);
  });
});
