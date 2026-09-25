import { describe, expect, it } from 'vitest';
import {
  availableTransitions,
  checkTransition,
  defineStateMachine,
  type TransitionActor,
} from './state-machine.js';

// Issuance life cycle of SPEC §7, used here as a realistic example (the real one arrives in phase 10).
const STATES = [
  'DRAFT',
  'UNDER_REVIEW',
  'APPROVED',
  'SUBSCRIPTION_OPEN',
  'SUBSCRIPTION_CLOSED',
  'ALLOCATED',
  'ACTIVE',
  'MATURED',
  'CANCELLED',
] as const;
type Status = (typeof STATES)[number];

const issuance = defineStateMachine<Status>({
  resourceType: 'ISSUANCE',
  states: STATES,
  transitions: [
    { from: ['DRAFT'], to: 'UNDER_REVIEW', permission: 'issuance:submit' },
    {
      from: ['UNDER_REVIEW'],
      to: 'APPROVED',
      permission: 'issuance:approve',
      distinctFromInitiator: true,
    },
    { from: ['UNDER_REVIEW'], to: 'DRAFT', permission: 'issuance:approve', commentRequired: true },
    { from: ['APPROVED'], to: 'SUBSCRIPTION_OPEN', permission: 'issuance:operate' },
    { from: ['SUBSCRIPTION_OPEN'], to: 'SUBSCRIPTION_CLOSED', permission: 'issuance:operate' },
    {
      from: ['DRAFT', 'UNDER_REVIEW', 'APPROVED', 'SUBSCRIPTION_OPEN', 'SUBSCRIPTION_CLOSED'],
      to: 'CANCELLED',
      permission: 'issuance:cancel',
      commentRequired: true,
    },
  ],
});

const admin: TransitionActor = {
  userId: 'admin',
  permissions: new Set([
    'issuance:submit',
    'issuance:approve',
    'issuance:operate',
    'issuance:cancel',
  ]),
};
const operator: TransitionActor = { userId: 'operator', permissions: new Set(['issuance:submit']) };
const system: TransitionActor = { userId: null, permissions: new Set() };

describe('state machine', () => {
  it('allows a declared transition to an actor with the permission', () => {
    expect(
      checkTransition(issuance, { from: 'DRAFT', to: 'UNDER_REVIEW', actor: operator }),
    ).toBeNull();
  });

  it('refuses an undeclared transition, whoever asks', () => {
    expect(checkTransition(issuance, { from: 'DRAFT', to: 'ACTIVE', actor: admin })).toBe(
      'INVALID_STATE_TRANSITION',
    );
    expect(checkTransition(issuance, { from: 'ALLOCATED', to: 'CANCELLED', actor: system })).toBe(
      'INVALID_STATE_TRANSITION',
    );
  });

  it('refuses an actor without the permission', () => {
    expect(
      checkTransition(issuance, { from: 'UNDER_REVIEW', to: 'APPROVED', actor: operator }),
    ).toBe('PERMISSION_DENIED');
  });

  it('requires a comment when the rule says so', () => {
    const request = { from: 'UNDER_REVIEW', to: 'DRAFT', actor: admin } as const;
    expect(checkTransition(issuance, request)).toBe('COMMENT_REQUIRED');
    expect(checkTransition(issuance, { ...request, comment: '   ' })).toBe('COMMENT_REQUIRED');
    expect(checkTransition(issuance, { ...request, comment: 'Wrong maturity date' })).toBeNull();
  });

  it('applies the four-eyes rule', () => {
    const request = { from: 'UNDER_REVIEW', to: 'APPROVED', actor: admin } as const;
    expect(checkTransition(issuance, { ...request, initiatorUserId: 'admin' })).toBe(
      'FOUR_EYES_VIOLATION',
    );
    expect(checkTransition(issuance, { ...request, initiatorUserId: 'operator' })).toBeNull();
  });

  it('lets the system make declared transitions without user permissions', () => {
    expect(
      checkTransition(issuance, {
        from: 'SUBSCRIPTION_OPEN',
        to: 'SUBSCRIPTION_CLOSED',
        actor: system,
      }),
    ).toBeNull();
  });

  it('keeps system-only transitions out of users reach', () => {
    const machine = defineStateMachine<'A' | 'B'>({
      resourceType: 'TEST',
      states: ['A', 'B'],
      transitions: [{ from: ['A'], to: 'B', permission: null }],
    });
    expect(checkTransition(machine, { from: 'A', to: 'B', actor: admin })).toBe(
      'PERMISSION_DENIED',
    );
    expect(checkTransition(machine, { from: 'A', to: 'B', actor: system })).toBeNull();
  });

  it('lists the transitions an actor may make', () => {
    expect(availableTransitions(issuance, 'UNDER_REVIEW', admin)).toEqual([
      'APPROVED',
      'DRAFT',
      'CANCELLED',
    ]);
    expect(availableTransitions(issuance, 'UNDER_REVIEW', operator)).toEqual([]);
  });

  it('rejects inconsistent definitions', () => {
    expect(() =>
      defineStateMachine<'A' | 'B'>({
        resourceType: 'TEST',
        states: ['A', 'B'],
        transitions: [{ from: ['A'], to: 'C' as 'B', permission: null }],
      }),
    ).toThrow(/unknown state C/);
    expect(() =>
      defineStateMachine<'A' | 'B'>({
        resourceType: 'TEST',
        states: ['A', 'B'],
        transitions: [
          { from: ['A'], to: 'B', permission: null },
          { from: ['A'], to: 'B', permission: 'issuance:operate' },
        ],
      }),
    ).toThrow(/declared twice/);
  });
});
