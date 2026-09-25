import { defineStateMachine, ISSUANCE_STATUSES, type IssuanceStatus } from '@virtus/shared';

/**
 * Life cycle of an issuance (SPEC §7.1, §4.8). The business preconditions (checks of §6.3 before
 * submitting, subscription start date before opening…) are checked by the use cases; the machine
 * says who may make which transition, with which comment.
 */
export const issuanceMachine = defineStateMachine<IssuanceStatus>({
  resourceType: 'issuance',
  states: ISSUANCE_STATUSES,
  transitions: [
    { from: ['DRAFT'], to: 'UNDER_REVIEW', permission: 'issuance:submit' },
    // Four eyes: the Issuer Administrator who approves did not submit it.
    {
      from: ['UNDER_REVIEW'],
      to: 'APPROVED',
      permission: 'issuance:approve',
      distinctFromInitiator: true,
    },
    { from: ['UNDER_REVIEW'], to: 'DRAFT', permission: 'issuance:approve', commentRequired: true },
    { from: ['APPROVED'], to: 'SUBSCRIPTION_OPEN', permission: 'issuance:operate' },
    // Also made by the system at the end date (daily job).
    { from: ['SUBSCRIPTION_OPEN'], to: 'SUBSCRIPTION_CLOSED', permission: 'issuance:operate' },
    // Allocation (phase 12), activation and maturity (phase 14).
    { from: ['SUBSCRIPTION_CLOSED'], to: 'ALLOCATED', permission: 'issuance:operate' },
    { from: ['ALLOCATED'], to: 'ACTIVE', permission: 'issuance:operate' },
    { from: ['ACTIVE'], to: 'MATURED', permission: 'issuance:operate' },
    {
      from: ['DRAFT', 'UNDER_REVIEW', 'APPROVED', 'SUBSCRIPTION_OPEN', 'SUBSCRIPTION_CLOSED'],
      to: 'CANCELLED',
      permission: 'issuance:cancel',
      commentRequired: true,
    },
  ],
});

/** Only a draft can be edited (terms and eligibility rules, docs/DATA_MODEL.md §3.4). */
export function isEditable(status: IssuanceStatus): boolean {
  return status === 'DRAFT';
}

/** Investors can be invited once the issuance is approved and until subscriptions close. */
export function acceptsInvitations(status: IssuanceStatus): boolean {
  return status === 'APPROVED' || status === 'SUBSCRIPTION_OPEN';
}
