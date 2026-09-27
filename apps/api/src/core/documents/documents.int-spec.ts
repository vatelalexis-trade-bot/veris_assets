// Documents (phase 8, docs/BACKLOG.md P8-3, SPEC §16).
import { randomUUID } from 'node:crypto';
import type { ErrorResponseBody } from '@veris/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startIntegrationApp, type IntegrationApp } from '../../test/integration-app.js';

let ctx: IntegrationApp;
let operator: ReturnType<typeof request.agent>;
let alpineId: string;
const errorOf = (response: request.Response) => (response.body as ErrorResponseBody).error;

const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');
const EICAR = Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*');

type Agent = ReturnType<typeof request.agent>;

function upload(
  agent: Agent,
  fields: Record<string, string>,
  content: Buffer = PDF,
  fileName = 'statement.pdf',
  key = randomUUID(),
) {
  let call = agent
    .post('/api/v1/documents')
    .set('Idempotency-Key', key)
    .attach('file', content, fileName);
  for (const [name, value] of Object.entries(fields)) call = call.field(name, value);
  return call;
}

async function download(agent: Agent, id: string) {
  const link = await agent.post(`/api/v1/documents/${id}/download-url`).send({}).expect(200);
  const { url } = link.body as { url: string };
  return agent
    .get(url)
    .buffer(true)
    .parse((res, done) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => done(null, Buffer.concat(chunks)));
    });
}

beforeAll(async () => {
  ctx = await startIntegrationApp();
  operator = await ctx.signIn('northwind.operator@example.com');
  const { rows } = await ctx.admin.query<{ id: string }>(
    `SELECT id FROM investor.investor WHERE legal_name LIKE 'Alpine%'`,
  );
  alpineId = rows[0]!.id;
});

afterAll(async () => {
  await ctx.close();
});

describe('upload (SPEC §16)', () => {
  it('stores the file with its real type, size and checksum, under the tenant’s path', async () => {
    const response = await upload(operator, {
      type: 'INVESTOR_DOCUMENT',
      name: 'Annual statement',
      confidentiality: 'INVESTOR_VISIBLE',
      ownerType: 'INVESTOR',
      investorId: alpineId,
    }).expect(201);
    const created = response.body as {
      id: string;
      current: { mimeType: string; sizeBytes: number; checksumSha256: string; fileName: string };
    };
    expect(created.current).toMatchObject({
      mimeType: 'application/pdf',
      sizeBytes: PDF.length,
      fileName: 'statement.pdf',
    });
    expect(created.current.checksumSha256).toMatch(/^[0-9a-f]{64}$/);
    const keys = [...ctx.storage.objects.keys()].filter((key) => key.includes(created.id));
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(/^tenants\/[0-9a-f-]{36}\/documents\/[0-9a-f-]{36}\/v1$/);
  });

  it('refuses a forbidden type even with an allowed name, and a file over 10 MB', async () => {
    const program = Buffer.from('4d5a90000300000004000000ffff0000b8000000', 'hex');
    const refused = await upload(
      operator,
      { type: 'REPORT', name: 'Fake PDF' },
      program,
      'invoice.pdf',
    ).expect(422);
    expect(errorOf(refused).code).toBe('FILE_TYPE_NOT_ALLOWED');

    const big = Buffer.concat([PDF, Buffer.alloc(10 * 1024 * 1024)]);
    const tooBig = await upload(operator, { type: 'REPORT', name: 'Too big' }, big).expect(422);
    expect(errorOf(tooBig).code).toBe('FILE_TOO_LARGE');
  });

  it('refuses a file rejected by the scan, audits it and stores nothing', async () => {
    const before = ctx.storage.objects.size;
    const csv = Buffer.concat([Buffer.from('name;note\nfile;'), EICAR, Buffer.from('\n')]);
    const response = await upload(
      operator,
      { type: 'REPORT', name: 'Infected' },
      csv,
      'data.csv',
    ).expect(422);
    expect(errorOf(response).code).toBe('FILE_REJECTED_BY_SCAN');
    expect(ctx.storage.objects.size).toBe(before);
    const { rowCount } = await ctx.admin.query(
      `SELECT 1 FROM audit.audit_event WHERE action = 'DOCUMENT_REJECTED' AND result = 'FAILED'
       AND correlation_id = $1`,
      [response.headers['x-correlation-id']],
    );
    expect(rowCount).toBe(1);
  });

  it('does the upload once when it is sent twice with the same key, and refuses another file', async () => {
    const key = randomUUID();
    const fields = { type: 'REPORT', name: `Twice ${Date.now()}` };
    const first = await upload(operator, fields, PDF, 'twice.pdf', key).expect(201);
    const second = await upload(operator, fields, PDF, 'twice.pdf', key).expect(201);
    expect(second.body).toEqual(first.body);
    const other = Buffer.concat([PDF, Buffer.from('% another file\n')]);
    const reused = await upload(operator, fields, other, 'twice.pdf', key).expect(422);
    expect(errorOf(reused).code).toBe('IDEMPOTENCY_KEY_REUSED');
  });
});

describe('access and download', () => {
  it('serves the file through a short-lived link, only to the user it was made for', async () => {
    const created = (
      await upload(operator, {
        type: 'REPORT',
        name: 'Internal report',
        confidentiality: 'INTERNAL',
      }).expect(201)
    ).body as { id: string };
    const response = await download(operator, created.id);
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('application/pdf');
    expect(response.headers['content-disposition']).toContain("filename*=UTF-8''statement.pdf");
    expect(Buffer.compare(response.body as Buffer, PDF)).toBe(0);

    const link = await operator
      .post(`/api/v1/documents/${created.id}/download-url`)
      .send({})
      .expect(200);
    const other = await ctx.signIn('northwind.admin1@example.com');
    await other.get((link.body as { url: string }).url).expect(404);
    await operator.get('/api/v1/documents/download?token=forged.token-value').expect(404);
  });

  it('shows an investor its own visible documents only, and audits confidential downloads', async () => {
    const visible = (
      await upload(operator, {
        type: 'INVESTOR_DOCUMENT',
        name: 'For Alpine',
        confidentiality: 'INVESTOR_VISIBLE',
        ownerType: 'INVESTOR',
        investorId: alpineId,
      }).expect(201)
    ).body as { id: string };
    const internal = (
      await upload(operator, {
        type: 'INVESTOR_DOCUMENT',
        name: 'Internal note on Alpine',
        confidentiality: 'INTERNAL',
        ownerType: 'INVESTOR',
        investorId: alpineId,
      }).expect(201)
    ).body as { id: string };

    const investor = await ctx.signIn('investor.a@example.com');
    const list = (await investor.get('/api/v1/documents?pageSize=100').expect(200)).body as {
      data: { id: string; investorId: string | null; confidentiality: string }[];
    };
    const ids = list.data.map((row) => row.id);
    expect(ids).toContain(visible.id);
    expect(ids).not.toContain(internal.id);
    expect(list.data.every((row) => row.investorId === alpineId)).toBe(true);
    await investor.get(`/api/v1/documents/${internal.id}`).expect(404);

    // The investor gives its own KYC evidence: stored as confidential, attached to itself.
    const evidence = (
      await upload(investor, {
        type: 'KYC_EVIDENCE',
        name: 'Registration extract',
        investorId: randomUUID(),
      }).expect(201)
    ).body as { id: string; investorId: string; confidentiality: string };
    expect(evidence).toMatchObject({ investorId: alpineId, confidentiality: 'CONFIDENTIAL' });
    const refused = await upload(investor, { type: 'REPORT', name: 'Not allowed' }).expect(403);
    expect(errorOf(refused).code).toBe('PERMISSION_DENIED');

    // The Auditor has no access to confidential documents.
    const auditor = await ctx.signIn('northwind.auditor@example.com');
    await auditor.get(`/api/v1/documents/${evidence.id}`).expect(404);

    const response = await download(operator, evidence.id);
    expect(response.status).toBe(200);
    const { rowCount } = await ctx.admin.query(
      `SELECT 1 FROM audit.audit_event WHERE action = 'DOCUMENT_DOWNLOADED' AND resource_id = $1`,
      [evidence.id],
    );
    expect(rowCount).toBe(1);
  });

  it('keeps every version, and archives a document', async () => {
    const created = (await upload(operator, { type: 'REPORT', name: 'Versioned' }).expect(201))
      .body as {
      id: string;
    };
    const second = Buffer.concat([PDF, Buffer.from('% version 2\n')]);
    const updated = await operator
      .post(`/api/v1/documents/${created.id}/versions`)
      .set('Idempotency-Key', randomUUID())
      .attach('file', second, 'versioned-v2.pdf')
      .expect(201);
    expect((updated.body as { currentVersion: number }).currentVersion).toBe(2);
    const detail = await operator.get(`/api/v1/documents/${created.id}`).expect(200);
    expect(
      (detail.body as { versions: { version: number }[] }).versions.map((row) => row.version),
    ).toEqual([2, 1]);

    await operator
      .post(`/api/v1/documents/${created.id}/archive`)
      .set('Idempotency-Key', randomUUID())
      .expect(200);
    const again = await operator
      .post(`/api/v1/documents/${created.id}/archive`)
      .set('Idempotency-Key', randomUUID())
      .expect(409);
    expect(errorOf(again).code).toBe('INVALID_STATE_TRANSITION');
    const active = (await operator.get('/api/v1/documents?pageSize=100').expect(200)).body as {
      data: { id: string }[];
    };
    expect(active.data.map((row) => row.id)).not.toContain(created.id);

    // Versions are append-only in the database.
    await expect(
      ctx.admin.query(`UPDATE core.document_version SET size_bytes = 1 WHERE document_id = $1`, [
        created.id,
      ]),
    ).rejects.toThrow(/append-only/);
  });
});
