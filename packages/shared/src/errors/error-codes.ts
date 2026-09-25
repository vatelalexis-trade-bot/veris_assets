// Stable error codes shared by the API and the web app (SPEC §22.2, docs/API.md §1.3).
// The API sends `code` + an English `message`; the web app displays the translation of `code`.
// Codes are never renamed or reused once published: add new ones instead.

type HttpStatus = 400 | 401 | 403 | 404 | 409 | 422 | 423 | 428 | 429 | 500 | 503;

interface ErrorDefinition {
  readonly status: HttpStatus;
  readonly message: string;
}

export const ERROR_CATALOG = {
  // General
  VALIDATION_FAILED: { status: 400, message: 'The request is invalid.' },
  RESOURCE_NOT_FOUND: { status: 404, message: 'The requested resource was not found.' },
  PERMISSION_DENIED: { status: 403, message: 'You are not allowed to perform this action.' },
  INVALID_STATE_TRANSITION: {
    status: 409,
    message: 'This action is not possible in the current status.',
  },
  VERSION_CONFLICT: {
    status: 409,
    message: 'The resource was modified by someone else. Reload and try again.',
  },
  FOUR_EYES_VIOLATION: {
    status: 403,
    message: 'This action must be validated by a different user than its initiator.',
  },
  COMMENT_REQUIRED: { status: 422, message: 'A comment is required for this action.' },
  PRECONDITION_REQUIRED: { status: 428, message: 'The If-Match header is required.' },
  RATE_LIMITED: { status: 429, message: 'Too many requests. Please try again later.' },
  PROVIDER_UNAVAILABLE: {
    status: 503,
    message: 'An external service is temporarily unavailable.',
  },
  INTERNAL_ERROR: { status: 500, message: 'An unexpected error occurred.' },

  // Idempotency
  IDEMPOTENCY_KEY_REQUIRED: {
    status: 428,
    message: 'The Idempotency-Key header is required for this action.',
  },
  IDEMPOTENCY_KEY_REUSED: {
    status: 422,
    message: 'This Idempotency-Key was already used with a different request.',
  },
  IDEMPOTENCY_IN_PROGRESS: {
    status: 409,
    message: 'A request with this Idempotency-Key is still being processed.',
  },

  // Authentication
  UNAUTHENTICATED: { status: 401, message: 'Authentication is required.' },
  INVALID_CREDENTIALS: { status: 401, message: 'The email or password is incorrect.' },
  MFA_REQUIRED: { status: 401, message: 'A second authentication factor is required.' },
  MFA_INVALID_CODE: { status: 401, message: 'The authentication code is invalid.' },
  ACCOUNT_LOCKED: {
    status: 423,
    message: 'The account is temporarily locked after too many failed attempts.',
  },
  ACCOUNT_INACTIVE: { status: 403, message: 'The account is inactive.' },
  SESSION_EXPIRED: { status: 401, message: 'The session has expired. Please sign in again.' },
  PASSWORD_TOO_WEAK: { status: 422, message: 'The password does not meet the requirements.' },
  INVITATION_INVALID_OR_EXPIRED: {
    status: 422,
    message: 'The invitation is invalid or has expired.',
  },

  // Issuance
  ISSUANCE_INCONSISTENT_TERMS: { status: 422, message: 'The issuance terms are inconsistent.' },
  SUBSCRIPTION_WINDOW_NOT_STARTED: {
    status: 422,
    message: 'The subscription period has not started yet.',
  },
  MINIMUM_NOT_REACHED_JUSTIFICATION_REQUIRED: {
    status: 422,
    message: 'The minimum amount is not reached: a justification is required to proceed.',
  },
  PENDING_PAYMENTS_REMAINING: {
    status: 422,
    message: 'Some subscriptions are still waiting for payment.',
  },

  // Eligibility
  ELIGIBILITY_FAILED: {
    status: 422,
    message: 'The investor does not meet the eligibility rules of this issuance.',
  },

  // Subscription
  SUBSCRIPTION_WINDOW_CLOSED: { status: 422, message: 'The subscription period is closed.' },
  SUBSCRIPTION_BELOW_MINIMUM: {
    status: 422,
    message: 'The amount is below the minimum subscription.',
  },
  SUBSCRIPTION_LIMIT_EXCEEDED: {
    status: 422,
    message: 'The requested subscription exceeds the permitted limit.',
  },
  AMOUNT_UNITS_MISMATCH: {
    status: 422,
    message: 'The amount does not match the number of units times the nominal value.',
  },
  INSUFFICIENT_UNITS: { status: 422, message: 'Not enough units are available.' },
  ISSUANCE_CAP_EXCEEDED: {
    status: 422,
    message: 'The request exceeds the maximum amount of the issuance.',
  },
  NOT_INVITED: { status: 422, message: 'The investor is not invited to this issuance.' },

  // Allocation and registry
  ALLOCATION_EXCEEDS_SUPPLY: {
    status: 422,
    message: 'The allocation exceeds the total number of units.',
  },
  ALLOCATION_EXCEEDS_REQUEST: {
    status: 422,
    message: 'The allocation exceeds the requested number of units.',
  },
  INSUFFICIENT_AVAILABLE_QUANTITY: {
    status: 422,
    message: 'The available quantity is insufficient.',
  },
  REGISTRY_INVARIANT_VIOLATION: {
    status: 422,
    message: 'The operation would break a registry invariant.',
  },
  QUANTITY_NOT_INTEGER: { status: 422, message: 'Quantities must be whole units.' },

  // Transfer
  TRANSFER_NOT_ALLOWED: { status: 422, message: 'Transfers are not allowed for this issuance.' },
  SELF_TRANSFER_FORBIDDEN: { status: 422, message: 'An investor cannot transfer to itself.' },
  LOCKUP_PERIOD_ACTIVE: { status: 422, message: 'Transfers are blocked until the lock-up end.' },
  RECIPIENT_CODE_UNKNOWN: { status: 422, message: 'The recipient code is unknown.' },
  RECIPIENT_NOT_ELIGIBLE: { status: 422, message: 'The recipient is not eligible.' },
  MAX_INVESTORS_REACHED: {
    status: 422,
    message: 'The maximum number of investors is reached.',
  },

  // Distribution
  DISTRIBUTION_ALREADY_EXISTS: {
    status: 422,
    message: 'A distribution already exists for this payment date.',
  },
  SNAPSHOT_MISMATCH: {
    status: 422,
    message: 'The recalculation from the snapshot gives a different result.',
  },

  // Documents
  FILE_TYPE_NOT_ALLOWED: { status: 422, message: 'This file type is not allowed.' },
  FILE_TOO_LARGE: { status: 422, message: 'The file is too large.' },
  FILE_REJECTED_BY_SCAN: { status: 422, message: 'The file was rejected by the security scan.' },
} as const satisfies Record<string, ErrorDefinition>;

export type ErrorCode = keyof typeof ERROR_CATALOG;

export const ERROR_CODES = Object.keys(ERROR_CATALOG) as ErrorCode[];

export function isErrorCode(value: string): value is ErrorCode {
  return Object.hasOwn(ERROR_CATALOG, value);
}

/** One item of `error.details`: a machine-readable code, the field concerned and extra data. */
export interface ErrorDetail {
  readonly code: string;
  readonly field: string | null;
  readonly meta?: Readonly<Record<string, unknown>>;
}

/** Response body of every API error (SPEC §22.2). */
export interface ErrorResponseBody {
  readonly error: {
    readonly code: ErrorCode;
    readonly message: string;
    readonly details: readonly ErrorDetail[];
    readonly correlationId: string;
    readonly timestamp: string;
  };
}
