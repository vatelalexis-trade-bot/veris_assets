/** Business events of subscriptions (outbox, SPEC §15). Payload: `investorId`, issuance `code`. */
export const SUBSCRIPTION_EVENTS = {
  submitted: 'registry.subscription.submitted',
  /** Approved or rejected; payload `decision`. */
  decided: 'registry.subscription.decided',
  cancelledByIssuer: 'registry.subscription.cancelled-by-issuer',
  /** Units allocated and blocked until payment (D-009); payload `units`. */
  allocated: 'registry.subscription.allocated',
  /** Nothing allocated: cancelled with the reason NOT_ALLOCATED (D-009). */
  notAllocated: 'registry.subscription.not-allocated',
} as const;

/** Business events of allocation rounds. Payload: issuance `code`, `proposedBy`. */
export const ALLOCATION_EVENTS = {
  proposed: 'registry.allocation.proposed',
  rejected: 'registry.allocation.rejected',
} as const;

/** Fictitious payments. Payload: issuance `code`, `investorId`, `units`, `preparedBy`. */
export const PAYMENT_EVENTS = {
  prepared: 'registry.payment.prepared',
  confirmed: 'registry.payment.confirmed',
} as const;

/** Registry corrections and anomalies. Payload: issuance `code`, `issuanceId`, `requestedBy`. */
export const REGISTRY_EVENTS = {
  correctionProposed: 'registry.correction.proposed',
  /** Payload `decision`: APPROVED or REJECTED. */
  correctionDecided: 'registry.correction.decided',
  anomaly: 'registry.reconciliation.anomaly',
} as const;

/** Transfers. Payload: issuance `code`, `units`, `fromInvestorId`, `toInvestorId`. */
export const TRANSFER_EVENTS = {
  submitted: 'registry.transfer.submitted',
  executed: 'registry.transfer.executed',
  rejected: 'registry.transfer.rejected',
  cancelledByIssuer: 'registry.transfer.cancelled-by-issuer',
} as const;
