import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  ERROR_CATALOG,
  type ErrorCode,
  type ErrorDetail,
  type ErrorResponseBody,
} from '@veris/shared';
import type { AuditWriter } from '../audit/audit-writer.js';
import type { SecurityMonitor } from '../security/security-monitor.js';
import { getRequestContext } from '../context/request-context.js';
import { AppError } from './app-error.js';

const CODE_BY_HTTP_STATUS: Partial<Record<number, ErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: 'VALIDATION_FAILED',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHENTICATED',
  [HttpStatus.FORBIDDEN]: 'PERMISSION_DENIED',
  [HttpStatus.NOT_FOUND]: 'RESOURCE_NOT_FOUND',
  // Unsupported methods on existing paths are reported like unknown paths.
  [HttpStatus.METHOD_NOT_ALLOWED]: 'RESOURCE_NOT_FOUND',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'VALIDATION_FAILED',
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: 'VALIDATION_FAILED',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
};

/**
 * Turns every exception into the standard error body (SPEC §22.2). Unexpected errors become
 * INTERNAL_ERROR: their details go to the logs with the correlation ID, never to the client.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  /** Denials of a signed-in user are audited (SPEC §17.1 "refus d'autorisation", scenario 5). */
  private static readonly AUDITED_DENIALS: ReadonlySet<ErrorCode> = new Set([
    'PERMISSION_DENIED',
    'RESOURCE_NOT_FOUND',
    'FOUR_EYES_VIOLATION',
  ]);

  constructor(
    private readonly audit?: AuditWriter,
    private readonly monitor?: SecurityMonitor,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request & { id?: string }>();

    const { code, details } = this.classify(exception);
    const { status, message } = ERROR_CATALOG[code];

    const user = getRequestContext()?.user;
    if (this.audit && user && AllExceptionsFilter.AUDITED_DENIALS.has(code)) {
      this.audit
        .record({
          tenantId: user.tenantId,
          actorUserId: user.userId,
          actorRole: user.roles.join(','),
          action:
            exception instanceof AppError
              ? (exception.auditAction ?? 'ACCESS_DENIED')
              : 'ACCESS_DENIED',
          resourceType: 'route',
          result: 'DENIED',
          reason: `${code} ${request.method} ${request.path}`,
          ipAddress: request.ip ?? null,
          userAgent: request.headers['user-agent'] ?? null,
        })
        .catch((error: unknown) =>
          this.logger.error({ err: error }, 'Access denial could not be audited'),
        );
      this.monitor
        ?.accessDenied(user, request.ip ?? null)
        .catch((error: unknown) =>
          this.logger.error({ err: error }, 'Access denial could not be counted'),
        );
    }

    if (code === 'INTERNAL_ERROR') {
      this.logger.error(exception instanceof Error ? exception : String(exception));
    }

    const body: ErrorResponseBody = {
      error: {
        code,
        message,
        details,
        correlationId: getRequestContext()?.correlationId ?? request.id ?? 'unknown',
        timestamp: new Date().toISOString(),
      },
    };
    response.status(status).json(body);
  }

  private classify(exception: unknown): { code: ErrorCode; details: readonly ErrorDetail[] } {
    if (exception instanceof AppError) return { code: exception.code, details: exception.details };
    if (exception instanceof HttpException) {
      return { code: CODE_BY_HTTP_STATUS[exception.getStatus()] ?? 'INTERNAL_ERROR', details: [] };
    }
    // Errors raised by Express middlewares (for example malformed JSON) carry an HTTP status.
    const status = (exception as { status?: unknown } | null)?.status;
    if (typeof status === 'number' && status >= 400 && status < 500) {
      return { code: CODE_BY_HTTP_STATUS[status] ?? 'VALIDATION_FAILED', details: [] };
    }
    return { code: 'INTERNAL_ERROR', details: [] };
  }
}
