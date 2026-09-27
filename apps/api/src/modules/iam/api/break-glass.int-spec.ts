// Emergency ("break-glass") access of a Platform Administrator (SPEC §4.1, P16-6, D-103).
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { QUEUES } from '../../../core/jobs/queues.js';
import type { OutboxJob } from '../../../core/outbox/outbox.js';
import { OutboxRelay } from '../../../core/outbox/outbox-relay.js';
import { startIntegrationApp, type IntegrationApp } from '../../../test/integration-app.js';

type Agent = ReturnType<typeof request.agent>;
let ctx: IntegrationApp;
let platform: Agent;
let northwind: string;

async function rows<T>(query: string, values: unknown[] = []): Promise<T[]> {
  return (await ctx.admin.query(query, values)).rows as T[];
}

async function deliverEvents(): Promise<void> {
  const relay = ctx.app.get(OutboxRelay);
  const jobs = await rows<{ data: OutboxJob }>(
    `SELECT data FROM pgboss.job WHERE name = $1 AND state = 'created'`,
    [QUEUES.outboxEvent.name],
  );
  for (const job of jobs) await relay.deliver(job.data);
  await ctx.admin.query(`DELETE FROM pgboss.job WHERE name = $1`, [QUEUES.outboxEvent.name]);
}

function start(agent: Agent, tenantId: string, reason: string) {
  return agent
    .post(`/api/v1/tenants/${tenantId}/break-glass`)
    .set('Idempotency-Key', randomUUID())
    .send({ reason });
}

beforeAll(async () => {
  ctx = await startIntegrationApp();
  platform = await ctx.signIn('platform.admin@example.com');
  northwind = (
    await rows<{ id: string }>(`SELECT id FROM iam.tenant WHERE legal_name LIKE 'Northwind%'`)
  )[0]!.id;
});

afterAll(async () => {
  await platform.delete('/api/v1/break-glass');
  await ctx.close();
});

describe('emergency access of a Platform Administrator', () => {
  it('is refused without a reason, to other roles and for an unknown organisation', async () => {
    await start(platform, northwind, 'short').expect(400);
    await start(platform, randomUUID(), 'Investigating a reported incident (demo)').expect(404);
    const admin = await ctx.signIn('northwind.admin1@example.com');
    await start(admin, northwind, 'Investigating a reported incident (demo)').expect(403);
  });

  it('gives one hour of read-only access to one organisation, traced request by request', async () => {
    const opened = (
      await start(platform, northwind, 'Support ticket 42: missing coupon (demo)').expect(201)
    ).body as { id: string; startedAt: string; expiresAt: string };
    expect(Date.parse(opened.expiresAt) - Date.parse(opened.startedAt)).toBe(3_600_000);
    await start(platform, northwind, 'A second one at the same time (demo)').expect(409);

    const me = (await platform.get('/api/v1/auth/me').expect(200)).body as {
      tenant: { id: string };
      homePortal: string;
      permissions: Record<string, string>;
      breakGlass: { reason: string } | null;
    };
    expect(me).toMatchObject({
      tenant: { id: northwind },
      homePortal: 'issuer',
      breakGlass: { reason: 'Support ticket 42: missing coupon (demo)' },
    });
    expect(me.permissions['registry:read']).toBe('all');
    expect(me.permissions['report:export']).toBeUndefined();

    // Reads the organisation's data; changes nothing, exports nothing; no platform action.
    const issuances = (await platform.get('/api/v1/issuances?pageSize=100').expect(200)).body as {
      data: { code: string }[];
    };
    expect(issuances.data.map((row) => row.code)).toContain('NWGN');
    await platform
      .post('/api/v1/exports')
      .set('Idempotency-Key', randomUUID())
      .send({ kind: 'REGISTRY' })
      .expect(403);
    await platform.get('/api/v1/tenants').expect(403);

    const audit = await rows<{ action: string; reason: string | null }>(
      `SELECT action, reason FROM audit.audit_event
       WHERE tenant_id = $1 AND action LIKE 'BREAK_GLASS%' ORDER BY occurred_at`,
      [northwind],
    );
    expect(audit[0]).toMatchObject({ action: 'BREAK_GLASS_STARTED' });
    expect(audit).toContainEqual({ action: 'BREAK_GLASS_ACCESS', reason: 'GET /api/v1/issuances' });

    await deliverEvents();
    const told = await rows<{ email: string }>(
      `SELECT u.email FROM core.notification n JOIN iam.user u ON u.id = n.user_id
       WHERE n.title_key = 'BREAK_GLASS_STARTED' AND n.resource_id = $1`,
      [northwind],
    );
    expect(told.map((row) => row.email)).toContain('northwind.admin1@example.com');
  });

  it('ends on request, back to the platform console', async () => {
    await platform.delete('/api/v1/break-glass').expect(204);
    const me = (await platform.get('/api/v1/auth/me').expect(200)).body as {
      tenant: unknown;
      homePortal: string;
      breakGlass: unknown;
    };
    expect(me).toMatchObject({ tenant: null, homePortal: 'platform', breakGlass: null });
    await platform.get('/api/v1/issuances').expect(403);
    const ended = await rows(
      `SELECT 1 FROM audit.audit_event WHERE tenant_id = $1 AND action = 'BREAK_GLASS_ENDED'`,
      [northwind],
    );
    expect(ended).toHaveLength(1);
  });
});
