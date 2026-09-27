// Audit log (phase 7, docs/BACKLOG.md P7-1 and P7-4): entries written in the business transaction,
// masking, consultation by the Auditor, status transitions (P7-5).
import { randomUUID } from 'node:crypto';
import type { ErrorResponseBody } from '@veris/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startIntegrationApp, type IntegrationApp } from '../../test/integration-app.js';
import { MASKED } from './masking.js';

let ctx: IntegrationApp;
let admin: ReturnType<typeof request.agent>;
const errorOf = (response: request.Response) => (response.body as ErrorResponseBody).error;

async function auditRows(correlationId: string) {
  const { rows } = await ctx.admin.query<{
    action: string;
    actor_user_id: string | null;
    actor_role: string | null;
    source: string;
    ip_address: string | null;
    old_value: Record<string, unknown> | null;
    new_value: Record<string, unknown> | null;
    result: string;
  }>(`SELECT * FROM audit.audit_event WHERE correlation_id = $1 ORDER BY occurred_at`, [
    correlationId,
  ]);
  return rows;
}

const correlationOf = (response: request.Response) =>
  response.headers['x-correlation-id'] as string;

beforeAll(async () => {
  ctx = await startIntegrationApp();
  admin = await ctx.signIn('northwind.admin1@example.com');
});

afterAll(async () => {
  await ctx.close();
});

describe('audit entries in the business transaction', () => {
  it('records who changed what, with the values before and after', async () => {
    const settings = await admin.get('/api/v1/settings').expect(200);
    const version = (settings.body as { version: number }).version;
    const response = await admin
      .patch('/api/v1/settings')
      .set('If-Match', `"${version}"`)
      .send({ timezone: 'Europe/Luxembourg' })
      .expect(200);
    const [entry] = await auditRows(correlationOf(response));
    expect(entry).toMatchObject({
      action: 'TENANT_SETTINGS_UPDATED',
      actor_role: 'ISSUER_ADMIN',
      source: 'WEB',
      result: 'SUCCESS',
      old_value: { timezone: 'Europe/Paris' },
      new_value: { timezone: 'Europe/Luxembourg' },
    });
    expect(entry!.actor_user_id).not.toBeNull();
    expect(entry!.ip_address).not.toBeNull();
  });

  it('writes no success entry when the operation fails', async () => {
    const response = await admin
      .patch('/api/v1/settings')
      .set('If-Match', '"999999"')
      .send({ timezone: 'Europe/Paris' })
      .expect(409);
    const actions = (await auditRows(correlationOf(response))).map((row) => row.action);
    expect(actions).not.toContain('TENANT_SETTINGS_UPDATED');
  });

  it('masks personal data (SPEC §17.2)', async () => {
    const email = `masked.${Date.now()}@example.com`;
    const response = await admin
      .post('/api/v1/users/invitations')
      .set('Idempotency-Key', randomUUID())
      .send({ email, name: 'Masked Person (demo)', roleCode: 'AUDITOR', locale: 'en-GB' })
      .expect(201);
    const [entry] = await auditRows(correlationOf(response));
    expect(entry).toMatchObject({
      action: 'USER_INVITED',
      new_value: { email: MASKED, name: MASKED, roleCode: 'AUDITOR' },
    });
    expect(JSON.stringify(entry)).not.toContain(email);
  });
});

describe('status transitions (P7-5)', () => {
  it('records each transition and refuses one the state machine does not allow', async () => {
    const { rows } = await ctx.admin.query<{ id: string }>(
      `SELECT id FROM iam.user WHERE email = 'investor.b@example.com'`,
    );
    const investorId = rows[0]!.id;
    await admin
      .post(`/api/v1/users/${investorId}/deactivate`)
      .set('Idempotency-Key', randomUUID())
      .expect(200);
    const transitions = await ctx.admin.query(
      `SELECT from_status, to_status, actor_role FROM core.workflow_transition
       WHERE resource_type = 'user' AND resource_id = $1 ORDER BY occurred_at DESC LIMIT 1`,
      [investorId],
    );
    expect(transitions.rows[0]).toEqual({
      from_status: 'ACTIVE',
      to_status: 'INACTIVE',
      actor_role: 'ISSUER_ADMIN',
    });

    const again = await admin
      .post(`/api/v1/users/${investorId}/deactivate`)
      .set('Idempotency-Key', randomUUID())
      .expect(409);
    expect(errorOf(again).code).toBe('INVALID_STATE_TRANSITION');

    await admin
      .post(`/api/v1/users/${investorId}/reactivate`)
      .set('Idempotency-Key', randomUUID())
      .expect(200);
  });
});

describe('audit log consultation (Auditor, SPEC §4.6)', () => {
  it('lists the entries of the organisation only, newest first, with the author’s name', async () => {
    const auditor = await ctx.signIn('northwind.auditor@example.com');
    const response = await auditor.get('/api/v1/audit-events?pageSize=100').expect(200);
    const page = response.body as {
      data: { id: string; action: string; occurredAt: string; actorName: string | null }[];
      meta: { total: number };
    };
    expect(page.meta.total).toBeGreaterThan(0);
    const dates = page.data.map((row) => row.occurredAt);
    expect(dates).toEqual([...dates].sort().reverse());
    expect(page.data.some((row) => row.actorName !== null)).toBe(true);

    const { rows } = await ctx.admin.query<{ id: string }>(
      `SELECT e.id FROM audit.audit_event e JOIN iam.tenant t ON t.id = e.tenant_id
       WHERE t.legal_name NOT LIKE 'Northwind%'`,
    );
    const foreign = new Set(rows.map((row) => row.id));
    expect(page.data.filter((row) => foreign.has(row.id))).toEqual([]);
  });

  it('filters by action and result, and shows the detail with masked values', async () => {
    const auditor = await ctx.signIn('northwind.auditor@example.com');
    const actions = (await auditor.get('/api/v1/audit-events/actions').expect(200))
      .body as string[];
    expect(actions).toContain('USER_INVITED');

    const filtered = await auditor
      .get('/api/v1/audit-events?action=USER_INVITED&result=SUCCESS')
      .expect(200);
    const data = (filtered.body as { data: { id: string; action: string }[] }).data;
    expect(data.length).toBeGreaterThan(0);
    expect(new Set(data.map((row) => row.action))).toEqual(new Set(['USER_INVITED']));

    const detail = await auditor.get(`/api/v1/audit-events/${data[0]!.id}`).expect(200);
    expect(detail.body).toMatchObject({ action: 'USER_INVITED', newValue: { email: MASKED } });
  });

  it('filters by period', async () => {
    const auditor = await ctx.signIn('northwind.auditor@example.com');
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const response = await auditor
      .get(`/api/v1/audit-events?from=${encodeURIComponent(future)}`)
      .expect(200);
    expect((response.body as { meta: { total: number } }).meta.total).toBe(0);
  });
});
