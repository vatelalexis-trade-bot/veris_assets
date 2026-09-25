import { ERROR_CATALOG, type ErrorCode, type ErrorDetail } from '@virtus/shared';

/**
 * Error with a stable code from the shared catalog. Throw it anywhere; the global exception
 * filter turns it into the standard error response with the catalog's HTTP status.
 */
export class AppError extends Error {
  readonly status: number;

  constructor(
    readonly code: ErrorCode,
    readonly details: readonly ErrorDetail[] = [],
    options?: { cause?: unknown },
  ) {
    super(ERROR_CATALOG[code].message, options);
    this.name = 'AppError';
    this.status = ERROR_CATALOG[code].status;
  }
}
