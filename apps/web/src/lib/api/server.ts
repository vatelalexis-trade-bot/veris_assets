import { cookies } from 'next/headers';
import { cache } from 'react';
import type { operations } from './schema';

// The web server calls the API directly on the machine (not through the public address).
const API_URL = `http://${process.env.API_HOST ?? '127.0.0.1'}:${process.env.API_PORT ?? '4000'}`;

/** Answer of GET /auth/me, generated from the API's OpenAPI document. */
export type CurrentUser =
  operations['AuthController_me']['responses'][200]['content']['application/json'];
export type PortalName = CurrentUser['homePortal'];

/** Calls the API from the web server with the visitor's cookies. */
export async function apiFromServer(path: string): Promise<Response> {
  const cookieHeader = (await cookies()).toString();
  return fetch(`${API_URL}${path}`, {
    headers: cookieHeader ? { cookie: cookieHeader } : {},
    cache: 'no-store',
  });
}

/** The signed-in user, or null. Called once per request even when several components need it. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const response = await apiFromServer('/api/v1/auth/me');
  if (response.status === 401) return null;
  if (!response.ok) throw new Error(`Unexpected answer from the API: ${response.status}`);
  return (await response.json()) as CurrentUser;
});
