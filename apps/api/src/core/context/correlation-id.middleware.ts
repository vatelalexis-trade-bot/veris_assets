import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { runWithRequestContext } from './request-context.js';

export const CORRELATION_ID_HEADER = 'X-Correlation-Id';

/** Longer user agents are cut: the audit log must not store arbitrary amounts of client text. */
const MAX_USER_AGENT_LENGTH = 512;

// Any UUID version. Other values are replaced, so that a caller cannot inject text into the logs.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function resolveCorrelationId(header: string | string[] | undefined): string {
  const candidate = Array.isArray(header) ? header[0] : header;
  return candidate !== undefined && UUID.test(candidate) ? candidate.toLowerCase() : randomUUID();
}

/**
 * First middleware of the chain: reads or creates the correlation ID, returns it in the
 * response header, exposes it as `req.id` for the HTTP logger and opens the request context
 * (with the client address and user agent, for the audit log).
 */
export function correlationIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const correlationId = resolveCorrelationId(req.headers[CORRELATION_ID_HEADER.toLowerCase()]);
  (req as Request & { id: string }).id = correlationId;
  res.setHeader(CORRELATION_ID_HEADER, correlationId);
  const userAgent = req.headers['user-agent'];
  runWithRequestContext(
    {
      correlationId,
      source: 'WEB',
      // The client address comes from Express ("trust proxy", see configure-app.ts).
      ipAddress: req.ip ?? null,
      userAgent: userAgent ? userAgent.slice(0, MAX_USER_AGENT_LENGTH) : null,
    },
    next,
  );
}
