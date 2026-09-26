/** Business events of subscriptions (outbox, SPEC §15). Payload: `investorId`, issuance `code`. */
export const SUBSCRIPTION_EVENTS = {
  submitted: 'registry.subscription.submitted',
  /** Approved or rejected; payload `decision`. */
  decided: 'registry.subscription.decided',
  cancelledByIssuer: 'registry.subscription.cancelled-by-issuer',
} as const;
