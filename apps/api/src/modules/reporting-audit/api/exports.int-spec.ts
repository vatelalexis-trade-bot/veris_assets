// CSV exports generated in the background (phase 15b, docs/BACKLOG.md P15-3).
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DocumentsService } from '../../../core/documents/documents.service.js';
import { QUEUES } from '../../../core/jobs/queues.js';
import type { OutboxJob } from '../../../core/outbox/outbox.js';
import { OutboxRelay } from '../../../core/outbox/outbox-relay.js';
import { startIntegrationApp, type IntegrationApp } from '../../../test/integration-app.js';
import { ExportsService, type ExportJob } from '../application/exports.service.js';

type Agent = ReturnType<typeof request.agent>;
let ctx: IntegrationApp;
let admin: Agent;

interface ExportView {
  id: string;
  kind: string;
  status: string;
  documentId: string | null;
  rowCount: number | null;
}

function ask(agent: Agent, body: object) {
  return agent.post('/api/v1/exports').set('Idempotency-Key', randomUUID()).send(body);
}

/** Runs the export jobs waiting in the queue, as the worker would (jobs are off in tests). */
async function runExportJobs(): Promise<void> {
  const { rows } = await ctx.admin.query<{ data: ExportJob }>(
    `SELECT data FROM pgboss.job WHERE name = $1 AND state = 'created'`,
    [QUEUES.exportGeneration.name],
  );
  for (const row of rows) await ctx.app.get(ExportsService).generate(row.data);
  await ctx.admin.query(`DELETE FROM pgboss.job WHERE name = $1`, [QUEUES.exportGeneration.name]);
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

async function download(agent: Agent, documentId: string): Promise<string> {
  const link = await agent
    .post(`/api/v1/documents/${documentId}/download-url`)
    .send({})
    .expect(200);
  const file = await agent
    .get((link.body as { url: string }).url)
    .buffer(true)
    .parse((res, done) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => done(null, Buffer.concat(chunks)));
    })
    .expect(200);
  return (file.body as Buffer).toString('utf8');
}

beforeAll(async () => {
  ctx = await startIntegrationApp();
  admin = await ctx.signIn('northwind.admin1@example.com');
});

afterAll(async () => {
  await ctx.close();
});

describe('CSV exports (SPEC §18)', () => {
  it('generates the registry of an issuance in the background, as an internal document', async () => {
    const { rows } = await ctx.admin.query<{ id: string }>(
      `SELECT id FROM issuance.issuance WHERE code = 'NWGN'`,
    );
    const issuanceId = rows[0]!.id;
    const asked = (await ask(admin, { kind: 'REGISTRY', issuanceId }).expect(201))
      .body as ExportView;
    expect(asked).toMatchObject({ kind: 'REGISTRY', status: 'QUEUED', documentId: null });

    await runExportJobs();
    const done = (await admin.get(`/api/v1/exports/${asked.id}`).expect(200)).body as ExportView;
    expect(done.status).toBe('DONE');
    expect(done.rowCount).toBeGreaterThanOrEqual(2);
    const csv = await download(admin, done.documentId!);
    // UTF-8 byte order mark first, for spreadsheets.
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.slice(1).trim().split('\r\n');
    expect(lines[0]).toMatch(/^# DEMONSTRATION/);
    expect(lines[1]).toBe(
      'issuance_code,account_type,account_id,investor_id,investor_name,quantity_held,quantity_blocked,quantity_available,nominal_value,nominal_amount,currency,updated_at',
    );
    expect(lines).toHaveLength(done.rowCount! + 2);
    expect(lines.slice(2).every((line) => line.startsWith('NWGN,'))).toBe(true);
    expect(lines.some((line) => line.includes('Alpine'))).toBe(true);
    const { rows: stored } = await ctx.admin.query(
      `SELECT type, confidentiality, owner_type FROM core.document WHERE id = $1`,
      [done.documentId],
    );
    expect(stored[0]).toEqual({
      type: 'REPORT',
      confidentiality: 'INTERNAL',
      owner_type: 'TENANT',
    });

    // The requester is told; running the job again changes nothing.
    await deliverEvents();
    const { rowCount } = await ctx.admin.query(
      `SELECT 1 FROM core.notification WHERE title_key = 'EXPORT_READY' AND resource_id = $1`,
      [asked.id],
    );
    expect(rowCount).toBe(1);
    await ctx.app
      .get(ExportsService)
      .generate({ tenantId: await tenantOf(asked.id), exportId: asked.id });
    const { rows: documents } = await ctx.admin.query(
      `SELECT 1 FROM core.document WHERE type = 'REPORT' AND name LIKE $1`,
      [`%${asked.id.slice(0, 8)}.csv`],
    );
    expect(documents).toHaveLength(1);
  });

  it('exports the audit log without IP addresses, for an auditor too', async () => {
    const auditor = await ctx.signIn('northwind.auditor@example.com');
    const asked = (await ask(auditor, { kind: 'AUDIT' }).expect(201)).body as ExportView;
    await runExportJobs();
    const done = (await auditor.get(`/api/v1/exports/${asked.id}`).expect(200)).body as ExportView;
    expect(done.status).toBe('DONE');
    const csv = await download(auditor, done.documentId!);
    expect(csv).toContain('EXPORT_REQUESTED');
    expect(csv).not.toMatch(/ip_address|user_agent/);
    // Its own exports only.
    const listed = (await auditor.get('/api/v1/exports').expect(200)).body as ExportView[];
    expect(listed.map((row) => row.id)).toEqual([asked.id]);
    await admin.get(`/api/v1/exports/${asked.id}`).expect(404);
  });

  it('exports subscriptions and distribution lines of the whole organisation', async () => {
    const subscriptions = (await ask(admin, { kind: 'SUBSCRIPTIONS' }).expect(201))
      .body as ExportView;
    const distributions = (await ask(admin, { kind: 'DISTRIBUTIONS' }).expect(201))
      .body as ExportView;
    await runExportJobs();
    const found = async (asked: ExportView) =>
      (await admin.get(`/api/v1/exports/${asked.id}`).expect(200)).body as ExportView;
    expect((await found(subscriptions)).rowCount).toBeGreaterThan(0);
    // The demo data may hold no paid distribution yet: an empty export is still generated.
    expect(await found(distributions)).toMatchObject({
      status: 'DONE',
      rowCount: expect.any(Number),
    });
  });

  it('keeps a failure on the request, and the job is retried', async () => {
    const asked = (await ask(admin, { kind: 'SUBSCRIPTIONS' }).expect(201)).body as ExportView;
    const spy = vi
      .spyOn(ctx.app.get(DocumentsService), 'storeGenerated')
      .mockRejectedValueOnce(new Error('storage down'));
    const job = { tenantId: await tenantOf(asked.id), exportId: asked.id };
    await expect(ctx.app.get(ExportsService).generate(job)).rejects.toThrow('storage down');
    expect((await admin.get(`/api/v1/exports/${asked.id}`).expect(200)).body).toMatchObject({
      status: 'FAILED',
      error: 'GENERATION_FAILED',
    });
    spy.mockRestore();
    await ctx.app.get(ExportsService).generate(job);
    expect((await admin.get(`/api/v1/exports/${asked.id}`).expect(200)).body).toMatchObject({
      status: 'DONE',
      error: null,
    });
    await ctx.admin.query(`DELETE FROM pgboss.job WHERE name = $1`, [QUEUES.exportGeneration.name]);
  });

  it('is kept to those allowed to export, within their organisation', async () => {
    const operator = await ctx.signIn('northwind.operator@example.com');
    await ask(operator, { kind: 'REGISTRY' }).expect(403);
    const investor = await ctx.signIn('investor.a@example.com');
    await ask(investor, { kind: 'REGISTRY' }).expect(403);
    await ask(admin, { kind: 'PAYMENTS' }).expect(400);

    await ask(admin, { kind: 'REGISTRY', issuanceId: randomUUID() }).expect(404);
    const contoso = await ctx.signIn('contoso.admin@example.com');
    const mine = (await admin.get('/api/v1/exports').expect(200)).body as ExportView[];
    await contoso.get(`/api/v1/exports/${mine[0]!.id}`).expect(404);
  });
});

async function tenantOf(exportId: string): Promise<string> {
  const { rows } = await ctx.admin.query<{ tenant_id: string }>(
    `SELECT tenant_id FROM reporting.export_request WHERE id = $1`,
    [exportId],
  );
  return rows[0]!.tenant_id;
}
