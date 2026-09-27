import { defineStateMachine } from '@veris/shared';

export const ACCOUNT_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

/** Status of a user (SPEC §4.2): deactivation and reactivation by an administrator. */
export const userStatusMachine = defineStateMachine<AccountStatus>({
  resourceType: 'user',
  states: ACCOUNT_STATUSES,
  transitions: [
    { from: ['ACTIVE'], to: 'INACTIVE', permission: 'user:manage' },
    { from: ['INACTIVE'], to: 'ACTIVE', permission: 'user:manage' },
  ],
});

/** Status of an organisation (SPEC §4.1): activation and deactivation by the Platform Administrator. */
export const tenantStatusMachine = defineStateMachine<AccountStatus>({
  resourceType: 'tenant',
  states: ACCOUNT_STATUSES,
  transitions: [
    { from: ['ACTIVE'], to: 'INACTIVE', permission: 'tenant:manage' },
    { from: ['INACTIVE'], to: 'ACTIVE', permission: 'tenant:manage' },
  ],
});
