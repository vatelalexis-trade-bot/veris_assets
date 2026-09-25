import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { runWithRequestContext } from './request-context.js';

export const CORRELATION_ID_HEADER = 'X-Correlation-Id';

// Any UUID version. Other values are replaced, so that a caller cannot inject text into the logs.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function resolveCorrelationId(header: string | string[] | undefined): string {
  const candidate = Array.isArray(header) ? header[0] : header;
  return candidate !== undefined && UUID.test(candidate) ? candidate.toLowerCase() : randomUUID();
}

/**
 * First middleware of the chain: reads or creates the correlation ID, returns it in the
 * response header, exposes it as `req.id` for the HTTP logger and opens the request context.
 */
export function correlationIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const correlationId = resolveCorrelationId(req.headers[CORRELATION_ID_HEADER.toLowerCase()]);
  (req as Request & { id: string }).id = correlationId;
  res.setHeader(CORRELATION_ID_HEADER, correlationId);
  runWithRequestContext({ correlationId }, next);
}
