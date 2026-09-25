import { describe, expect, it } from 'vitest';
import { DOWNLOAD_LINK_SECONDS, DownloadTokens } from './download-token.js';
import { detectDocumentType } from './file-type.js';

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');

describe('real type of a file (SPEC §16)', () => {
  it('recognises the allowed types from their content', async () => {
    expect(await detectDocumentType(PDF)).toBe('application/pdf');
    expect(await detectDocumentType(PNG)).toBe('image/png');
    expect(await detectDocumentType(Buffer.from('ffd8ffe000104a464946', 'hex'))).toBe('image/jpeg');
    expect(await detectDocumentType(Buffer.from('name;amount\nAlpine;2500.00\n'))).toBe('text/csv');
  });

  it('refuses other types, whatever the file is called', async () => {
    // A Windows program, a GIF image, plain text without columns, binary data.
    expect(
      await detectDocumentType(Buffer.from('4d5a90000300000004000000ffff0000', 'hex')),
    ).toBeNull();
    expect(await detectDocumentType(Buffer.from('GIF89a\x01\x00\x01\x00'))).toBeNull();
    expect(await detectDocumentType(Buffer.from('just a sentence\n'))).toBeNull();
    expect(await detectDocumentType(Buffer.from([0x00, 0x01, 0x02, 0x2c, 0x0a]))).toBeNull();
  });
});

describe('download links (D-045)', () => {
  const tokens = new DownloadTokens('a-test-secret-of-at-least-thirty-two-characters');
  const grant = { documentId: 'doc', version: 1, tenantId: 'tenant', userId: 'user' };

  it('are valid 5 minutes, for exactly what was granted', () => {
    const now = Date.UTC(2026, 8, 25, 10);
    const { token, expiresAt } = tokens.issue(grant, now);
    expect(expiresAt.getTime()).toBe(now + DOWNLOAD_LINK_SECONDS * 1000);
    expect(tokens.verify(token, now + 60_000)).toMatchObject(grant);
    expect(tokens.verify(token, now + DOWNLOAD_LINK_SECONDS * 1000 + 1)).toBeNull();
  });

  it('cannot be altered or made with another secret', () => {
    const { token } = tokens.issue(grant);
    const [payload, signature] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({ ...grant, documentId: 'other', expiresAt: 9e9 }),
    ).toString('base64url');
    expect(tokens.verify(`${forged}.${signature}`)).toBeNull();
    expect(tokens.verify(`${payload}.${signature}x`)).toBeNull();
    expect(
      new DownloadTokens('another-secret-of-at-least-thirty-two-chars!').verify(token),
    ).toBeNull();
    expect(tokens.verify('garbage')).toBeNull();
  });
});
