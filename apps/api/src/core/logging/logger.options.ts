import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { stdTimeFunctions } from 'pino';
import type { Options } from 'pino-http';
import type { Env } from '../config/env.js';
import { REDACTED_PATHS, REDACTION_CENSOR } from './redaction.js';

/** HTTP logger configuration: JSON lines, UTC ISO timestamps, correlation ID, masked secrets. */
export function buildPinoHttpOptions(env: Env): Options {
  return {
    level: env.LOG_LEVEL,
    // `req.id` is set by correlationIdMiddleware, which runs first.
    genReqId: (req: IncomingMessage & { id?: unknown }) =>
      typeof req.id === 'string' ? req.id : randomUUID(),
    // Logs written while handling a request carry only the correlation ID, not the whole request.
    quietReqLogger: true,
    customAttributeKeys: { reqId: 'correlationId' },
    redact: { paths: REDACTED_PATHS, censor: REDACTION_CENSOR },
    timestamp: stdTimeFunctions.isoTime,
    formatters: { level: (label) => ({ level: label }) },
    // Health probes are called often and carry no information.
    autoLogging: { ignore: (req) => req.url?.startsWith('/health') ?? false },
    // Human-readable output in development only; JSON everywhere else.
    ...(env.NODE_ENV === 'development' && {
      transport: {
        target: 'pino-pretty',
        options: { singleLine: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' },
      },
    }),
  };
}
