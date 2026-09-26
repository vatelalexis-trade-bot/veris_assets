/** Business events of distributions. Payload: issuance `code`, `issuanceId`, `preparedBy`. */
export const DISTRIBUTION_EVENTS = {
  submitted: 'servicing.distribution.submitted',
  paymentPrepared: 'servicing.distribution.payment-prepared',
  paid: 'servicing.distribution.paid',
} as const;
