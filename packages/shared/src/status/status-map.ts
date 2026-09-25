// Single mapping of every business status to a colour tone (SPEC §23.2). Labels are translated by
// the web app with the key `status.<domain>.<STATUS>`; the web app maps tones to theme colours.
// Statuses come from SPEC §7, §8.2, §8.3, §9.2, §11.2 and §12.4.

/** success = validated, warning = waiting, error = rejected or failed (SPEC §23.1). */
export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'error';

export const STATUS_TONES = {
  issuance: {
    DRAFT: 'neutral',
    UNDER_REVIEW: 'warning',
    APPROVED: 'success',
    SUBSCRIPTION_OPEN: 'info',
    SUBSCRIPTION_CLOSED: 'neutral',
    ALLOCATED: 'info',
    ACTIVE: 'success',
    MATURED: 'neutral',
    CANCELLED: 'error',
  },
  subscription: {
    DRAFT: 'neutral',
    SUBMITTED: 'info',
    UNDER_REVIEW: 'warning',
    APPROVED: 'success',
    REJECTED: 'error',
    PAYMENT_PENDING: 'warning',
    PAYMENT_CONFIRMED: 'success',
    ALLOCATED: 'success',
    CANCELLED: 'error',
  },
  kyc: {
    NOT_STARTED: 'neutral',
    IN_PROGRESS: 'info',
    PENDING_REVIEW: 'warning',
    APPROVED: 'success',
    REJECTED: 'error',
    EXPIRED: 'error',
  },
  eligibility: {
    NOT_ASSESSED: 'neutral',
    ELIGIBLE: 'success',
    NOT_ELIGIBLE: 'error',
    SUSPENDED: 'error',
  },
  transfer: {
    DRAFT: 'neutral',
    SUBMITTED: 'info',
    COMPLIANCE_REVIEW: 'warning',
    APPROVED: 'success',
    REJECTED: 'error',
    EXECUTED: 'success',
    CANCELLED: 'error',
  },
  distribution: {
    DRAFT: 'neutral',
    CALCULATED: 'info',
    UNDER_REVIEW: 'warning',
    APPROVED: 'success',
    PAYMENT_INSTRUCTION_GENERATED: 'info',
    PAID: 'success',
    FAILED: 'error',
    CANCELLED: 'error',
  },
  /** Result of an audit log entry (SPEC §17.2). */
  auditResult: {
    SUCCESS: 'success',
    DENIED: 'warning',
    FAILED: 'error',
  },
} as const satisfies Record<string, Record<string, StatusTone>>;

export type StatusDomain = keyof typeof STATUS_TONES;
export type StatusOf<Domain extends StatusDomain> = keyof (typeof STATUS_TONES)[Domain] & string;

export const STATUS_DOMAINS = Object.keys(STATUS_TONES) as StatusDomain[];

export function statusTone<Domain extends StatusDomain>(
  domain: Domain,
  status: StatusOf<Domain>,
): StatusTone {
  return (STATUS_TONES[domain] as Record<string, StatusTone>)[status] ?? 'neutral';
}

/** Translation key of a status label, e.g. `status.issuance.UNDER_REVIEW`. */
export function statusLabelKey(domain: StatusDomain, status: string): string {
  return `status.${domain}.${status}`;
}
