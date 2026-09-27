import { defineStateMachine } from '@veris/shared';

export const SUBSCRIPTION_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'APPROVED',
  'REJECTED',
  'PAYMENT_PENDING',
  'PAYMENT_CONFIRMED',
  'ALLOCATED',
  'CANCELLED',
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/**
 * Life cycle of a subscription (SPEC §9.2, decision D-009). Allocation (APPROVED →
 * PAYMENT_PENDING, or CANCELLED when nothing is allocated) and the fictitious payment arrive in
 * phase 12; the machine already holds them.
 */
export const subscriptionMachine = defineStateMachine<SubscriptionStatus>({
  resourceType: 'subscription',
  states: SUBSCRIPTION_STATUSES,
  transitions: [
    { from: ['DRAFT'], to: 'SUBMITTED', permission: 'subscription:create' },
    { from: ['SUBMITTED'], to: 'UNDER_REVIEW', permission: 'subscription:review' },
    { from: ['UNDER_REVIEW'], to: 'APPROVED', permission: 'subscription:approve' },
    {
      from: ['UNDER_REVIEW'],
      to: 'REJECTED',
      permission: 'subscription:approve',
      commentRequired: true,
    },
    { from: ['APPROVED'], to: 'PAYMENT_PENDING', permission: 'allocation:validate' },
    {
      from: ['PAYMENT_PENDING'],
      to: 'PAYMENT_CONFIRMED',
      permission: 'payment:confirm',
      distinctFromInitiator: true,
    },
    { from: ['PAYMENT_CONFIRMED'], to: 'ALLOCATED', permission: 'payment:confirm' },
    // The investor cancels before approval; the issuer until the payment is pending (SPEC §9.2).
    {
      from: ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'PAYMENT_PENDING'],
      to: 'CANCELLED',
      permission: 'subscription:cancel',
    },
  ],
});

/** Statuses counted in the investor's and the issuance's totals ("souscriptions actives", §9.3). */
export const ACTIVE_SUBSCRIPTION_STATUSES: readonly SubscriptionStatus[] = [
  'SUBMITTED',
  'UNDER_REVIEW',
  'APPROVED',
  'PAYMENT_PENDING',
  'PAYMENT_CONFIRMED',
  'ALLOCATED',
];

/** An investor may cancel its own subscription only before it is approved. */
export const CANCELLABLE_BY_INVESTOR: readonly SubscriptionStatus[] = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
];
