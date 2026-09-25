// Idempotency (phase 7, docs/BACKLOG.md P7-3, docs/ARCHITECTURE.md §4.8).
import { randomUUID } from 'node:crypto';
import type { ErrorResponseBody } from '@virtus/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startIntegrationApp, type IntegrationApp } from '../../test/integration-app.js';
import { IdempotencyCleanup } from './idempotency-cleanup.js';

let ctx: IntegrationApp;
let admin: ReturnType<typeof request.agent>;
const errorOf = (response: request.Response) => (response.body as ErrorResponseBody).error;

const invitee = (email: string) => ({
  email,
  name: 'Idempotent Invitee (demo)',
  roleCode: 'AUDITOR',
  locale: 'en-GB',
});

async function invitationsTo(email: string): Promise<number> {
  const { rowCount } = await ctx.admin.query(`SELECT 1 FROM iam.user_invitation WHERE email = $1`, [
    email,
  ]);
  return rowCount ?? 0;
}

beforeAll(async () => {
  ctx = await startIntegrationApp();
  admin = await ctx.signIn('northwind.admin1@example.com');
});

afterAll(async () => {
  await ctx.close();
});

describe('Idempotency-Key', () => {
  it('is required on the marked routes, and must be a UUID', async () => {
    const missing = await admin
      .post('/api/v1/users/invitations')
      .send(invitee(`missing.${Date.now()}@example.com`))
      .expect(428);
    expect(errorOf(missing).code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    const invalid = await admin
      .post('/api/v1/users/invitations')
      .set('Idempotency-Key', 'not-a-uuid')
      .send(invitee(`invalid.${Date.now()}@example.com`))
      .expect(400);
    expect(errorOf(invalid).details[0]).toMatchObject({ code: 'INVALID_IDEMPOTENCY_KEY' });
  });

  it('returns the first answer to a repeated request, without doing the work twice', async () => {
    const email = `repeat.${Date.now()}@example.com`;
    const key = randomUUID();
    const first = await admin
      .post('/api/v1/users/invitations')
      .set('Idempotency-Key', key)
      .send(invitee(email))
      .expect(201);
    const second = await admin
      .post('/api/v1/users/invitations')
      .set('Idempotency-Key', key)
      .send(invitee(email))
      .expect(201);
    expect(second.body).toEqual(first.body);
    expect(second.headers['idempotent-replayed']).toBe('true');
    expect(await invitationsTo(email)).toBe(1);
    expect(ctx.emails.messages.filter((message) => message.to === email)).toHaveLength(1);
  });

  it('refuses the same key for a different request', async () => {
    const key = randomUUID();
    await admin
      .post('/api/v1/users/invitations')
      .set('Idempotency-Key', key)
      .send(invitee(`first.${Date.now()}@example.com`))
      .expect(201);
    const reused = await admin
      .post('/api/v1/users/invitations')
      .set('Idempotency-Key', key)
      .send(invitee(`other.${Date.now()}@example.com`))
      .expect(422);
    expect(errorOf(reused).code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('keeps nothing of a failed request: the same key can be used again', async () => {
    const key = randomUUID();
    const email = `retry.${Date.now()}@example.com`;
    await admin
      .post('/api/v1/users/invitations')
      .set('Idempotency-Key', key)
      .send({ ...invitee(email), roleCode: 'INVESTOR' })
      .expect(400);
    await admin
      .post('/api/v1/users/invitations')
      .set('Idempotency-Key', key)
      .send(invitee(email))
      .expect(201);
    expect(await invitationsTo(email)).toBe(1);
  });

  it('does the work once when the same request arrives twice at the same time', async () => {
    const email = `concurrent.${Date.now()}@example.com`;
    const key = randomUUID();
    const send = () =>
      admin.post('/api/v1/users/invitations').set('Idempotency-Key', key).send(invitee(email));
    const statuses = (await Promise.all([send(), send()])).map((response) => response.status);
    // The second one waits for the first: it gets the same answer, or 409 if it waited too long.
    expect(statuses).toContain(201);
    expect(statuses.every((status) => status === 201 || status === 409)).toBe(true);
    expect(await invitationsTo(email)).toBe(1);
  });

  it('is scoped to the user: another user may use the same key', async () => {
    const key = randomUUID();
    await admin
      .post('/api/v1/users/invitations')
      .set('Idempotency-Key', key)
      .send(invitee(`scoped.a.${Date.now()}@example.com`))
      .expect(201);
    const secondAdmin = await ctx.signIn('northwind.admin2@example.com');
    await secondAdmin
      .post('/api/v1/users/invitations')
      .set('Idempotency-Key', key)
      .send(invitee(`scoped.b.${Date.now()}@example.com`))
      .expect(201);
  });

  it('forgets expired keys: the daily job deletes them in every tenant', async () => {
    const key = randomUUID();
    await admin
      .post('/api/v1/users/invitations')
      .set('Idempotency-Key', key)
      .send(invitee(`expired.${Date.now()}@example.com`))
      .expect(201);
    await ctx.admin.query(
      `UPDATE core.idempotency_key SET expires_at = now() - interval '1 minute' WHERE key = $1`,
      [key],
    );
    expect(await ctx.app.get(IdempotencyCleanup).purge()).toBeGreaterThanOrEqual(1);
    const { rowCount } = await ctx.admin.query(
      `SELECT 1 FROM core.idempotency_key WHERE key = $1`,
      [key],
    );
    expect(rowCount).toBe(0);
  });
});
