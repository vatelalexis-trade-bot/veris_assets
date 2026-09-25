import { checkTransition, type IssuanceTermsRuleCode } from '@virtus/shared';
import { describe, expect, it } from 'vitest';
import { checkIssuance, type IssuanceToCheck } from './issuance-checks.js';
import { acceptsInvitations, isEditable, issuanceMachine } from './issuance-machine.js';

/** "Helios Solar SPV 2027" of scenario 1: consistent in every way. */
const helios: IssuanceToCheck = {
  name: 'Helios Solar SPV 2027',
  code: 'HELIOS27',
  assetCategory: 'RENEWABLE_ENERGY',
  countryCode: 'FR',
  currency: 'EUR',
  legalIssuerName: 'Helios Solar SPV SAS (demo)',
  terms: {
    targetAmount: '5000000.00',
    minimumAmount: '2000000.00',
    maximumAmount: '6000000.00',
    nominalValue: '1000.00',
    totalUnits: '5000',
    interestRate: '0.05',
    rateType: 'FIXED',
    distributionFrequency: 'SEMI_ANNUAL',
    dayCount: '30E_360',
    issueDate: '2027-01-15',
    maturityDate: '2032-01-15',
    subscriptionStartDate: '2026-10-01',
    subscriptionEndDate: '2026-12-31',
    minSubscriptionAmount: '100000.00',
    maxAmountPerInvestor: '1000000.00',
  },
  allowedCountries: [],
  excludedCountries: ['US'],
};

type Changes = Omit<Partial<IssuanceToCheck>, 'terms'> & {
  terms?: Partial<IssuanceToCheck['terms']>;
};

const codes = (changes: Changes) =>
  checkIssuance({ ...helios, ...changes, terms: { ...helios.terms, ...changes.terms } }).map(
    (failure) => failure.code,
  );

describe('issuance consistency checks (SPEC §6.3)', () => {
  it('accepts a consistent issuance', () => {
    expect(checkIssuance(helios)).toEqual([]);
  });

  const cases: [IssuanceTermsRuleCode, Changes][] = [
    [
      'TARGET_NOT_EQUAL_NOMINAL_TIMES_UNITS',
      { terms: { targetAmount: '4999000.00', minimumAmount: '1000000.00' } },
    ],
    ['MIN_TARGET_MAX_ORDER', { terms: { maximumAmount: '4000000.00' } }],
    ['MIN_SUBSCRIPTION_ABOVE_MAX_PER_INVESTOR', { terms: { minSubscriptionAmount: '2000000.00' } }],
    ['DATE_ORDER_INVALID', { terms: { subscriptionEndDate: '2027-02-01' } }],
    ['COUNTRY_BOTH_ALLOWED_AND_EXCLUDED', { allowedCountries: ['FR', 'US'] }],
    ['NEGATIVE_RATE', { terms: { interestRate: '-0.01' } }],
    ['RATE_TYPE_NOT_SUPPORTED', { terms: { rateType: 'FLOATING' } }],
    ['FREQUENCY_NOT_SUPPORTED', { terms: { distributionFrequency: 'WEEKLY' } }],
    ['AMOUNT_TOO_PRECISE', { terms: { minSubscriptionAmount: '100000.001' } }],
  ];

  it.each(cases)('reports %s', (code, changes) => {
    expect(codes(changes)).toEqual([code]);
  });

  it('refuses fractional or zero units', () => {
    expect(
      codes({
        terms: { totalUnits: '5000.5', targetAmount: '5000500.00', maximumAmount: '6000000.00' },
      }),
    ).toEqual(['UNITS_NOT_INTEGER']);
    expect(codes({ terms: { totalUnits: '0' } })).toContain('UNITS_NOT_INTEGER');
  });

  it('names every missing field needed to submit', () => {
    const failures = checkIssuance({
      ...helios,
      legalIssuerName: '',
      terms: { ...helios.terms, maturityDate: null },
    });
    expect(failures).toEqual([
      { code: 'REQUIRED_FIELD_MISSING', field: 'legalIssuerName' },
      { code: 'REQUIRED_FIELD_MISSING', field: 'terms.maturityDate' },
    ]);
  });

  it('compares amounts as decimals, not floating-point numbers', () => {
    // 0.1 × 3 = 0.3 exactly (a float would give 0.30000000000000004).
    expect(
      codes({
        terms: {
          nominalValue: '0.10',
          totalUnits: '3',
          targetAmount: '0.30',
          minimumAmount: '0.10',
          maximumAmount: '0.30',
          minSubscriptionAmount: '0.10',
          maxAmountPerInvestor: '0.30',
        },
      }),
    ).toEqual([]);
  });

  it('accepts a subscription end on the issue date, but not a start after the end', () => {
    expect(codes({ terms: { subscriptionEndDate: '2027-01-15' } })).toEqual([]);
    expect(codes({ terms: { subscriptionStartDate: '2026-12-31' } })).toEqual([
      'DATE_ORDER_INVALID',
    ]);
    expect(codes({ terms: { maturityDate: '2027-01-15' } })).toEqual(['DATE_ORDER_INVALID']);
  });
});

describe('issuance life cycle (SPEC §7)', () => {
  const operator = {
    userId: 'operator',
    permissions: new Set(['issuance:submit', 'issuance:edit']),
  };
  const admin = {
    userId: 'admin',
    permissions: new Set([
      'issuance:submit',
      'issuance:approve',
      'issuance:operate',
      'issuance:cancel',
    ]),
  };

  it('is submitted by the staff and approved by another administrator (four eyes)', () => {
    expect(
      checkTransition(issuanceMachine, { from: 'DRAFT', to: 'UNDER_REVIEW', actor: operator }),
    ).toBeNull();
    expect(
      checkTransition(issuanceMachine, {
        from: 'UNDER_REVIEW',
        to: 'APPROVED',
        actor: operator,
        initiatorUserId: 'operator',
      }),
    ).toBe('PERMISSION_DENIED');
    expect(
      checkTransition(issuanceMachine, {
        from: 'UNDER_REVIEW',
        to: 'APPROVED',
        actor: admin,
        initiatorUserId: 'admin',
      }),
    ).toBe('FOUR_EYES_VIOLATION');
    expect(
      checkTransition(issuanceMachine, {
        from: 'UNDER_REVIEW',
        to: 'APPROVED',
        actor: admin,
        initiatorUserId: 'operator',
      }),
    ).toBeNull();
  });

  it('requires a comment to send back to draft or cancel, and never cancels after allocation', () => {
    expect(
      checkTransition(issuanceMachine, { from: 'UNDER_REVIEW', to: 'DRAFT', actor: admin }),
    ).toBe('COMMENT_REQUIRED');
    expect(
      checkTransition(issuanceMachine, {
        from: 'SUBSCRIPTION_OPEN',
        to: 'CANCELLED',
        actor: admin,
        comment: 'x',
      }),
    ).toBeNull();
    expect(
      checkTransition(issuanceMachine, {
        from: 'ALLOCATED',
        to: 'CANCELLED',
        actor: admin,
        comment: 'x',
      }),
    ).toBe('INVALID_STATE_TRANSITION');
  });

  it('lets the system close subscriptions', () => {
    expect(
      checkTransition(issuanceMachine, {
        from: 'SUBSCRIPTION_OPEN',
        to: 'SUBSCRIPTION_CLOSED',
        actor: { userId: null, permissions: new Set() },
      }),
    ).toBeNull();
  });

  it('is edited only as a draft, and invites investors once approved', () => {
    expect(isEditable('DRAFT')).toBe(true);
    expect(isEditable('UNDER_REVIEW')).toBe(false);
    expect(acceptsInvitations('DRAFT')).toBe(false);
    expect(acceptsInvitations('APPROVED')).toBe(true);
    expect(acceptsInvitations('SUBSCRIPTION_OPEN')).toBe(true);
    expect(acceptsInvitations('SUBSCRIPTION_CLOSED')).toBe(false);
  });
});
