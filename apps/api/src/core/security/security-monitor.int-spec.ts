// Detection of unusual access (SPEC §24, P16-1, D-100).
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { QUEUES } from '../jobs/queues.js';
import type { OutboxJob } from '../outbox/outbox.js';
import { OutboxRelay } from '../outbox/outbox-relay.js';
import { startIntegrationApp, type IntegrationApp } from '../../test/integration-app.js';

let ctx: IntegrationApp;

async function signInFrom(email: string, ip: string) {
  const agent = request.agent(ctx.app.getHttpServer());
  await agent
    .post('/api/v1/auth/sign-in')
    .set('X-Forwarded-For', ip)
    .send({ email, password: ctx.env.DEMO_ACCOUNTS_PASSWORD })
    .expect(200);
  return agent;
}

async function count(query: string, values: unknown[]): Promise<number> {
  const { rows } = await ctx.admin.query<{ total: string }>(query, values);
  return Number.parseInt(rows[0]!.total, 10);
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

const userId = async (email: string) =>
  (await ctx.admin.query<{ id: string }>(`SELECT id FROM iam.user WHERE email = $1`, [email]))
    .rows[0]!.id;

beforeAll(async () => {
  ctx = await startIntegrationApp();
});

afterAll(async () => {
  await ctx.close();
});

describe('detection of unusual access', () => {
  it('tells the account holder about a sign-in from a new address, once', async () => {
    const email = 'northwind.operator@example.com';
    const operator = await userId(email);
    const alerts = (ip: string) =>
      count(
        `SELECT count(*) AS total FROM audit.audit_event
         WHERE action = 'SECURITY_NEW_SIGN_IN_ADDRESS' AND actor_user_id = $1 AND ip_address = $2`,
        [operator, ip],
      );
    await signInFrom(email, '198.51.100.1');
    await signInFrom(email, '198.51.100.1');
    // A known address raises nothing.
    const known = await alerts('198.51.100.1');
    await signInFrom(email, '198.51.100.1');
    expect(await alerts('198.51.100.1')).toBe(known);

    await signInFrom(email, '198.51.100.2');
    expect(await alerts('198.51.100.2')).toBe(1);
    await deliverEvents();
    expect(
      await count(
        `SELECT count(*) AS total FROM core.notification WHERE user_id = $1 AND title_key = 'NEW_SIGN_IN_ADDRESS'`,
        [operator],
      ),
    ).toBeGreaterThanOrEqual(1);
  });

  it('raises one alert for a burst of refused requests, told to the administrators', async () => {
    const email = 'investor.b@example.com';
    const investor = await userId(email);
    const agent = await ctx.signIn(email);
    const suspicious = () =>
      count(
        `SELECT count(*) AS total FROM audit.audit_event
         WHERE action = 'SECURITY_SUSPICIOUS_ACTIVITY' AND actor_user_id = $1`,
        [investor],
      );
    for (let index = 0; index < 10; index += 1) await agent.get('/api/v1/dashboard').expect(403);
    // Written just after the refusal is answered, so the refusal is never slowed down.
    await vi.waitFor(async () => expect(await suspicious()).toBe(1));
    await agent.get('/api/v1/dashboard').expect(403);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(await suspicious()).toBe(1);
    await deliverEvents();
    const admin = await userId('northwind.admin1@example.com');
    expect(
      await count(
        `SELECT count(*) AS total FROM core.notification
         WHERE user_id = $1 AND title_key = 'SUSPICIOUS_ACTIVITY' AND resource_id = $2`,
        [admin, investor],
      ),
    ).toBe(1);
  });
});
