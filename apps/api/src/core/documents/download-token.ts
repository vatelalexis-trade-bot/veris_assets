import { createHmac, timingSafeEqual } from 'node:crypto';

/** A download link is valid 5 minutes (SPEC §16, docs/ARCHITECTURE.md §4.11). */
export const DOWNLOAD_LINK_SECONDS = 5 * 60;

export interface DownloadGrant {
  documentId: string;
  version: number;
  tenantId: string;
  userId: string;
  /** Expiry, in seconds since 1970 (UTC). */
  expiresAt: number;
}

/**
 * Signed, short-lived download links (decision D-045): the API checks the rights when it creates
 * the link, then serves the file itself; the storage is never exposed to the browser.
 */
export class DownloadTokens {
  private readonly key: Buffer;

  constructor(secret: string) {
    // A key of its own, derived from the application secret.
    this.key = createHmac('sha256', secret).update('virtus:document-download').digest();
  }

  issue(
    grant: Omit<DownloadGrant, 'expiresAt'>,
    now = Date.now(),
  ): { token: string; expiresAt: Date } {
    const expiresAt = Math.floor(now / 1000) + DOWNLOAD_LINK_SECONDS;
    const payload = Buffer.from(JSON.stringify({ ...grant, expiresAt })).toString('base64url');
    return { token: `${payload}.${this.sign(payload)}`, expiresAt: new Date(expiresAt * 1000) };
  }

  /** The grant of a valid token, or null (wrong signature, altered or expired). */
  verify(token: string, now = Date.now()): DownloadGrant | null {
    const [payload, signature] = token.split('.');
    if (!payload || !signature) return null;
    const expected = Buffer.from(this.sign(payload));
    const given = Buffer.from(signature);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
    try {
      const grant = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as DownloadGrant;
      return grant.expiresAt * 1000 > now ? grant : null;
    } catch {
      return null;
    }
  }

  private sign(payload: string): string {
    return createHmac('sha256', this.key).update(payload).digest('base64url');
  }
}
