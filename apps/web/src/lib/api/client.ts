import type { ErrorResponseBody } from '@veris/shared';
import createClient from 'openapi-fetch';
import type { paths } from './schema';

/**
 * Typed API client for the browser (decision D-027). Requests go to the same origin and reach the
 * API through the Next.js proxy (decision D-004), so the session cookie is sent automatically.
 * Types are generated from the API's OpenAPI document with `pnpm api:generate`.
 */
export const api = createClient<paths>({ baseUrl: '' });

/** Error code of an API error body (SPEC §22.2), or INTERNAL_ERROR when the body is not one. */
export function errorCodeOf(error: unknown): string {
  const code = (error as Partial<ErrorResponseBody> | undefined)?.error?.code;
  return typeof code === 'string' ? code : 'INTERNAL_ERROR';
}

/** Codes of the error details (for example password rules). */
export function errorDetailCodesOf(error: unknown): string[] {
  const details = (error as Partial<ErrorResponseBody> | undefined)?.error?.details;
  return Array.isArray(details) ? details.map((detail) => detail.code) : [];
}

export function correlationIdOf(error: unknown): string | undefined {
  return (error as Partial<ErrorResponseBody> | undefined)?.error?.correlationId;
}
