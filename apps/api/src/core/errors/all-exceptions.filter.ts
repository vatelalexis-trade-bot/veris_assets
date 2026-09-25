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
} from '@virtus/shared';
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

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request & { id?: string }>();

    const { code, details } = this.classify(exception);
    const { status, message } = ERROR_CATALOG[code];

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
