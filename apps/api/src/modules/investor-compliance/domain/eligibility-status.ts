import { defineStateMachine, ELIGIBILITY_STATUSES, type EligibilityStatus } from '@virtus/shared';

/**
 * Eligibility status of an investor, decided by a Compliance Officer (SPEC §4.4, §8.3), always
 * with a justification. Nobody goes back to "not assessed".
 */
export const eligibilityStatusMachine = defineStateMachine<EligibilityStatus>({
  resourceType: 'investor_eligibility',
  states: ELIGIBILITY_STATUSES,
  transitions: [
    {
      from: ['NOT_ASSESSED', 'NOT_ELIGIBLE', 'SUSPENDED'],
      to: 'ELIGIBLE',
      permission: 'eligibility:decide',
      commentRequired: true,
    },
    {
      from: ['NOT_ASSESSED', 'ELIGIBLE', 'SUSPENDED'],
      to: 'NOT_ELIGIBLE',
      permission: 'eligibility:decide',
      commentRequired: true,
    },
    {
      from: ['NOT_ASSESSED', 'ELIGIBLE', 'NOT_ELIGIBLE'],
      to: 'SUSPENDED',
      permission: 'eligibility:decide',
      commentRequired: true,
    },
  ],
});
