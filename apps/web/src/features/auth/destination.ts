import type { PortalName } from '@/lib/api/server';

/** Path of each portal after the language prefix. */
export const PORTAL_PATHS: Record<PortalName, string> = {
  platform: '/platform',
  issuer: '/issuer',
  investor: '/portal',
};

/**
 * Only relative paths of this site are accepted as destinations after sign-in, so that a crafted
 * link can never send the user to another website ("open redirect").
 */
export function safeNextPath(next: string | null | undefined): string | null {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return null;
  return next;
}
