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
