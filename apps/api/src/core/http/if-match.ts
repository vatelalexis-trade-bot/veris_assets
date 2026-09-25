import { AppError } from '../errors/app-error.js';

/**
 * Optimistic locking (docs/API.md §1): a PATCH sends the version it read in If-Match ("3" or 3).
 * Missing → 428 PRECONDITION_REQUIRED; a stale version is detected by the update itself (409).
 */
export function expectedVersion(header: string | undefined): number {
  if (header === undefined || header.trim() === '') throw new AppError('PRECONDITION_REQUIRED');
  const match = /^(?:W\/)?"?(\d{1,9})"?$/.exec(header.trim());
  if (!match)
    throw new AppError('VALIDATION_FAILED', [{ code: 'INVALID_IF_MATCH', field: 'If-Match' }]);
  return Number(match[1]);
}

/** ETag header value of a version, returned with every resource that can be modified. */
export function etagOf(version: number): string {
  return `"${version}"`;
}
