// Outbox, notifications and their emails (phase 7, docs/BACKLOG.md P7-2 and P7-4).
import { randomUUID } from 'node:crypto';
import type { ErrorResponseBody } from '@virtus/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startIntegrationApp, type IntegrationApp } from '../../test/integration-app.js';
import { QUEUES } from '../jobs/queues.js';
import type { OutboxJob } from '../outbox/outbox.js';
import { OutboxRelay } from '../outbox/outbox-relay.js';
import { NotificationEmails } from './notification-emails.js';
import type { NotificationEmailJob } from './notification.service.js';

let ctx: IntegrationApp;
let admin: ReturnType<typeof request.agent>;
let relay: OutboxRelay;
let emails: NotificationEmails;
const errorOf = (response: request.Response) => (response.body as ErrorResponseBody).error;

async function idOfUser(email: string): Promise<string> {
  const { rows } = await ctx.admin.query<{ id: string }>(
    `SELECT id FROM iam.user WHERE email = $1`,
    [email],
  );
  return rows[0]!.id;
}

async function eventsOf(aggregateId: string) {
  const { rows } = await ctx.admin.query<{
    id: string;
    tenant_id: string;
    event_type: string;
    processed_at: Date | null;
  }>(`SELECT * FROM core.outbox_event WHERE aggregate_id = $1 ORDER BY occurred_at`, [aggregateId]);
  return rows;
}

/** Jobs waiting in a queue, with their data (the workers are off in tests). */
async function queuedJobs<T>(queue: string): Promise<{ id: string; data: T }[]> {
  const { rows } = await ctx.admin.query<{ id: string; data: T }>(
    `SELECT id, data FROM pgboss.job WHERE name = $1 AND state = 'created' ORDER BY created_on`,
    [queue],
  );
  return rows;
}

async function clearQueue(queue: string): Promise<void> {
  await ctx.admin.query(`DELETE FROM pgboss.job WHERE name = $1`, [queue]);
}

/** Runs the queued jobs of the outbox and of the emails, as the workers would. */
async function runWorkers(): Promise<void> {
  for (const job of await queuedJobs<OutboxJob>(QUEUES.outboxEvent.name)) {
    await relay.deliver(job.data);
  }
  for (const job of await queuedJobs<NotificationEmailJob>(QUEUES.notificationEmail.name)) {
    await emails.deliver(job.data);
  }
  await clearQueue(QUEUES.outboxEvent.name);
  await clearQueue(QUEUES.notificationEmail.name);
}

beforeAll(async () => {
  ctx = await startIntegrationApp();
  relay = ctx.app.get(OutboxRelay);
  emails = ctx.app.get(NotificationEmails);
  admin = await ctx.signIn('northwind.admin1@example.com');
  // Clean slate: the events left by the previous test files (workers are off in tests).
  await ctx.admin.query(
    `UPDATE core.outbox_event SET processed_at = now() WHERE processed_at IS NULL`,
  );
  await clearQueue(QUEUES.outboxEvent.name);
  await clearQueue(QUEUES.notificationEmail.name);
});

afterAll(async () => {
  await ctx.close();
});

describe('outbox (SPEC §15)', () => {
  it('writes the event and its delivery job with the operation, and nothing when it fails', async () => {
    const auditorId = await idOfUser('northwind.auditor@example.com');
    const before = (await eventsOf(auditorId)).length;
    await admin
      .put(`/api/v1/users/${auditorId}/roles`)
      .set('Idempotency-Key', randomUUID())
      .send({ roles: ['AUDITOR', 'COMPLIANCE_OFFICER'] })
      .expect(200);
    const events = await eventsOf(auditorId);
    expect(events).toHaveLength(before + 1);
    expect(events.at(-1)).toMatchObject({
      event_type: 'iam.user.roles-changed',
      processed_at: null,
    });
    const jobs = await queuedJobs<OutboxJob>(QUEUES.outboxEvent.name);
    expect(jobs.map((job) => job.data.eventId)).toContain(events.at(-1)!.id);

    // Refused operation (an administrator may not give the Investor role): no event.
    const adminId = await idOfUser('northwind.admin2@example.com');
    const refused = await admin
      .put(`/api/v1/users/${adminId}/roles`)
      .set('Idempotency-Key', randomUUID())
      .send({ roles: ['INVESTOR'] });
    expect(errorOf(refused).details).toEqual([
      expect.objectContaining({ code: 'ROLE_NOT_ASSIGNABLE' }),
    ]);
    expect(await eventsOf(adminId)).toHaveLength(0);
  });

  it('delivers an event once: one notification and one email, in the user’s language', async () => {
    const auditorId = await idOfUser('northwind.auditor@example.com');
    const [event] = (await eventsOf(auditorId)).filter((row) => !row.processed_at);
    const job = { tenantId: event!.tenant_id, eventId: event!.id };
    expect(await relay.deliver(job)).toBe(true);
    // A second delivery (retry, safety net) changes nothing.
    expect(await relay.deliver(job)).toBe(false);
    const notifications = await ctx.admin.query(
      `SELECT title_key, category FROM core.notification WHERE source_event_id = $1`,
      [event!.id],
    );
    expect(notifications.rows).toEqual([{ title_key: 'ROLES_CHANGED', category: 'SECURITY' }]);

    const emailJobs = await queuedJobs<NotificationEmailJob>(QUEUES.notificationEmail.name);
    expect(emailJobs).toHaveLength(1);
    // Identifiers and codes only in the job queue: no email address, no name.
    expect(JSON.stringify(emailJobs[0]!.data)).not.toContain('@');
    await emails.deliver(emailJobs[0]!.data);
    const sent = ctx.emails.messages.at(-1)!;
    expect(sent.to).toBe('northwind.auditor@example.com');
    expect(sent.subject).toBe('Your roles have changed');
    expect(sent.text).toContain('Demonstration environment');
    await runWorkers();
  });

  it('keeps pending events for the safety net, and leaves recent ones to their own job', async () => {
    const auditorId = await idOfUser('northwind.auditor@example.com');
    await admin
      .put(`/api/v1/users/${auditorId}/roles`)
      .set('Idempotency-Key', randomUUID())
      .send({ roles: ['AUDITOR'] })
      .expect(200);
    await clearQueue(QUEUES.outboxEvent.name); // as if the job had been lost
    expect(await relay.sweep()).toBe(0);
    const pending = (await eventsOf(auditorId)).filter((row) => !row.processed_at);
    await ctx.admin.query(
      `UPDATE core.outbox_event SET occurred_at = now() - interval '5 minutes' WHERE id = $1`,
      [pending[0]!.id],
    );
    expect(await relay.sweep()).toBeGreaterThanOrEqual(1);
    const jobs = await queuedJobs<OutboxJob>(QUEUES.outboxEvent.name);
    expect(jobs.map((job) => job.data.eventId)).toContain(pending[0]!.id);
    await runWorkers();
    const [swept] = (await eventsOf(auditorId)).filter((row) => row.id === pending[0]!.id);
    expect(swept!.processed_at).not.toBeNull();
  });
});

describe('notifications of the signed-in user (docs/API.md §2.12)', () => {
  it('lists, counts and marks notifications as read', async () => {
    const auditor = await ctx.signIn('northwind.auditor@example.com');
    const unread = await auditor.get('/api/v1/notifications/unread-count').expect(200);
    expect((unread.body as { count: number }).count).toBeGreaterThan(0);

    const list = await auditor.get('/api/v1/notifications?unreadOnly=true').expect(200);
    const [first] = (list.body as { data: { id: string; type: string; readAt: string | null }[] })
      .data;
    expect(first).toMatchObject({ type: 'ROLES_CHANGED', readAt: null });
    await auditor.post(`/api/v1/notifications/${first!.id}/read`).expect(204);
    await auditor.post('/api/v1/notifications/read-all').expect(204);
    const after = await auditor.get('/api/v1/notifications/unread-count').expect(200);
    expect((after.body as { count: number }).count).toBe(0);

    // Somebody else's notification is invisible, even in the same organisation.
    const other = await ctx.signIn('northwind.operator@example.com');
    await other.post(`/api/v1/notifications/${first!.id}/read`).expect(404);
  });

  it('keeps security notifications on, and follows the user’s other choices', async () => {
    const inviter = await ctx.signIn('northwind.admin1@example.com');
    const refused = await inviter
      .put('/api/v1/notifications/preferences')
      .send({ preferences: [{ category: 'SECURITY', inApp: true, email: false }] })
      .expect(400);
    expect(errorOf(refused).details).toEqual([
      expect.objectContaining({ code: 'MANDATORY_CATEGORY', field: 'SECURITY' }),
    ]);

    const saved = await inviter
      .put('/api/v1/notifications/preferences')
      .send({ preferences: [{ category: 'ORGANISATION', inApp: true, email: false }] })
      .expect(200);
    expect(saved.body).toContainEqual({
      category: 'ORGANISATION',
      inApp: true,
      email: false,
      mandatory: false,
    });
    expect(saved.body).toContainEqual({
      category: 'SECURITY',
      inApp: true,
      email: true,
      mandatory: true,
    });

    // An invitation accepted: the inviter gets the in-app notification, but no email.
    const email = `accepted.${Date.now()}@example.com`;
    await inviter
      .post('/api/v1/users/invitations')
      .set('Idempotency-Key', randomUUID())
      .send({ email, name: 'New Auditor (demo)', roleCode: 'AUDITOR', locale: 'en-GB' })
      .expect(201);
    const token = ctx.emails.lastLinkTo(email).split('/invitation/')[1]!;
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/auth/invitations/${token}/accept`)
      .send({ password: 'a quiet violet lighthouse at dawn' })
      .expect(200);
    const outboxJobs = await queuedJobs<OutboxJob>(QUEUES.outboxEvent.name);
    for (const job of outboxJobs) await relay.deliver(job.data);
    await clearQueue(QUEUES.outboxEvent.name);

    const inviterId = await idOfUser('northwind.admin1@example.com');
    const notifications = await ctx.admin.query(
      `SELECT title_key FROM core.notification WHERE user_id = $1 AND title_key = 'INVITATION_ACCEPTED'`,
      [inviterId],
    );
    expect(notifications.rowCount).toBe(1);
    const emailJobs = await queuedJobs<NotificationEmailJob>(QUEUES.notificationEmail.name);
    expect(emailJobs.filter((job) => job.data.userId === inviterId)).toEqual([]);
  });
});
