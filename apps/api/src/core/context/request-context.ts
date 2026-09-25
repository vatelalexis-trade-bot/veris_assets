import { AsyncLocalStorage } from 'node:async_hooks';
import type { Permission, PermissionScope } from '@virtus/shared';

/** The signed-in user of the request, set by the authentication guard. */
export interface RequestUser {
  userId: string;
  /** Null for platform users. Always from the session, never from the request (SPEC §20). */
  tenantId: string | null;
  roles: readonly string[];
  permissions: ReadonlyMap<Permission, PermissionScope>;
}

/**
 * Data attached to the request being processed, available anywhere in the call chain without
 * passing it as a parameter.
 */
export interface RequestContext {
  readonly correlationId: string;
  user?: RequestUser;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(context: RequestContext, callback: () => T): T {
  return storage.run(context, callback);
}

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

/** Called once by the authentication guard. */
export function setRequestUser(user: RequestUser): void {
  const context = storage.getStore();
  if (context) context.user = user;
}

/** The signed-in user; only for code behind a route that requires a session. */
export function currentUser(): RequestUser {
  const user = storage.getStore()?.user;
  if (!user) throw new Error('No signed-in user in the request context');
  return user;
}
