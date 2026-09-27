import { checkTransition } from '@veris/shared';
import { describe, expect, it } from 'vitest';
import { checkSubscription, type SubscriptionCheckInput } from './subscription-checks.js';
import { subscriptionMachine } from './subscription-machine.js';

/** 150 units of Northwind Senior Debt 2026 (nominal 1 000, min 100 000, max 2 000 000 per investor). */
const request: SubscriptionCheckInput = {
  issuanceStatus: 'SUBSCRIPTION_OPEN',
  today: '2026-09-26',
  subscriptionStartDate: '2026-09-06',
  subscriptionEndDate: '2026-11-05',
  nominalValue: '1000.00',
  totalUnits: '10000',
  maximumAmount: '12000000.00',
  minSubscriptionAmount: '100000.00',
  maxAmountPerInvestor: '2000000.00',
  requestedUnits: '150',
  requestedAmount: '150000.00',
  investorActiveAmount: '0',
};

const code = (changes: Partial<SubscriptionCheckInput>) =>
  checkSubscription({ ...request, ...changes })?.code ?? null;

describe('subscription checks (SPEC §9.3)', () => {
  it('accepts a subscription within every limit', () => {
    expect(checkSubscription(request)).toBeNull();
  });

  it('checks the status and the dates of the subscription window', () => {
    expect(code({ issuanceStatus: 'APPROVED' })).toBe('SUBSCRIPTION_WINDOW_CLOSED');
    expect(code({ today: '2026-09-05' })).toBe('SUBSCRIPTION_WINDOW_NOT_STARTED');
    expect(code({ today: '2026-11-06' })).toBe('SUBSCRIPTION_WINDOW_CLOSED');
    expect(code({ today: '2026-11-05' })).toBeNull();
  });

  it('requires whole units and an amount equal to units times the nominal value', () => {
    expect(code({ requestedUnits: '150.5' })).toBe('QUANTITY_NOT_INTEGER');
    expect(code({ requestedUnits: '0', requestedAmount: '0' })).toBe('QUANTITY_NOT_INTEGER');
    expect(checkSubscription({ ...request, requestedAmount: '149999.99' })).toEqual({
      code: 'AMOUNT_UNITS_MISMATCH',
      meta: { expectedAmount: '150000' },
    });
  });

  it('applies the minimum, and the maximum per investor across its active subscriptions', () => {
    expect(code({ requestedUnits: '99', requestedAmount: '99000.00' })).toBe(
      'SUBSCRIPTION_BELOW_MINIMUM',
    );
    expect(code({ investorActiveAmount: '1850000.00' })).toBeNull();
    expect(code({ investorActiveAmount: '1850000.01' })).toBe('SUBSCRIPTION_LIMIT_EXCEEDED');
  });

  it('refuses one subscription above the supply, but lets the total exceed it (oversubscription)', () => {
    expect(
      code({ requestedUnits: '10001', requestedAmount: '10001000.00', maxAmountPerInvestor: null }),
    ).toBe('INSUFFICIENT_UNITS');
    expect(
      code({
        requestedUnits: '10000',
        requestedAmount: '10000000.00',
        maxAmountPerInvestor: null,
        maximumAmount: '9000000.00',
      }),
    ).toBe('ISSUANCE_CAP_EXCEEDED');
  });
});

describe('subscription life cycle (SPEC §9.2, D-009)', () => {
  const investor = {
    userId: 'investor',
    permissions: new Set(['subscription:create', 'subscription:cancel']),
  };
  const operator = {
    userId: 'operator',
    permissions: new Set(['subscription:review', 'subscription:cancel']),
  };
  const admin = {
    userId: 'admin',
    permissions: new Set(['subscription:approve', 'subscription:cancel']),
  };

  it('is submitted by the investor, reviewed by the staff and decided by an administrator', () => {
    expect(
      checkTransition(subscriptionMachine, { from: 'DRAFT', to: 'SUBMITTED', actor: investor }),
    ).toBeNull();
    expect(
      checkTransition(subscriptionMachine, {
        from: 'SUBMITTED',
        to: 'UNDER_REVIEW',
        actor: operator,
      }),
    ).toBeNull();
    expect(
      checkTransition(subscriptionMachine, {
        from: 'UNDER_REVIEW',
        to: 'APPROVED',
        actor: operator,
      }),
    ).toBe('PERMISSION_DENIED');
    expect(
      checkTransition(subscriptionMachine, { from: 'UNDER_REVIEW', to: 'APPROVED', actor: admin }),
    ).toBeNull();
  });

  it('requires a reason to reject, and never goes back from a final status', () => {
    expect(
      checkTransition(subscriptionMachine, { from: 'UNDER_REVIEW', to: 'REJECTED', actor: admin }),
    ).toBe('COMMENT_REQUIRED');
    expect(
      checkTransition(subscriptionMachine, { from: 'REJECTED', to: 'CANCELLED', actor: admin }),
    ).toBe('INVALID_STATE_TRANSITION');
    expect(
      checkTransition(subscriptionMachine, { from: 'ALLOCATED', to: 'CANCELLED', actor: admin }),
    ).toBe('INVALID_STATE_TRANSITION');
  });
});
