import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Data attached to the request being processed, available anywhere in the call chain
 * without passing it as a parameter. Tenant, user and transaction are added in phases 5–6.
 */
export interface RequestContext {
  readonly correlationId: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(context: RequestContext, callback: () => T): T {
  return storage.run(context, callback);
}

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}
