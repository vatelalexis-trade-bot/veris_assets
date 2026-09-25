import { ELIGIBILITY_RULE_CODES, type EligibilityRuleCode } from '@virtus/shared';
import { describe, expect, it } from 'vitest';
import {
  evaluateEligibility,
  failedRuleCodes,
  type EligibilityContext,
  type EligibilityInvestor,
  type EligibilityRuleSet,
} from './eligibility.js';

const TODAY = '2026-09-25';

/** An investor that passes every rule of the strictest rule set below. */
const investor: EligibilityInvestor = {
  type: 'LEGAL_ENTITY',
  classification: 'PROFESSIONAL',
  countryOfIncorporation: 'FR',
  profileStatus: 'ACTIVE',
  kycStatus: 'APPROVED',
  kycExpiryDate: '2027-06-30',
  eligibilityStatus: 'ELIGIBLE',
};

/** Every rule switched on. */
const strict: EligibilityRuleSet = {
  professionalOnly: true,
  allowedCountries: ['FR', 'LU', 'DE', 'US'],
  excludedCountries: ['US'],
  allowedInvestorTypes: ['LEGAL_ENTITY'],
  allowedClassifications: ['PROFESSIONAL', 'ELIGIBLE_COUNTERPARTY'],
  kycRequired: true,
  kycMinRemainingValidityDays: 90,
  maxInvestors: 10,
  rulesVersion: 3,
};

/** No restriction at all. */
const open: EligibilityRuleSet = {
  professionalOnly: false,
  allowedCountries: [],
  excludedCountries: [],
  allowedInvestorTypes: [],
  allowedClassifications: [],
  kycRequired: false,
  kycMinRemainingValidityDays: 0,
  maxInvestors: null,
  rulesVersion: 1,
};

const context: EligibilityContext = {
  today: TODAY,
  currentInvestorCount: 4,
  alreadyInvestor: false,
};

const failures = (
  facts: Partial<EligibilityInvestor>,
  rules: Partial<EligibilityRuleSet> = {},
  more: Partial<EligibilityContext> = {},
) =>
  failedRuleCodes(
    evaluateEligibility(
      { ...investor, ...facts },
      { ...strict, ...rules },
      { ...context, ...more },
    ),
  );

describe('eligibility engine (SPEC §8.4)', () => {
  it('finds an investor meeting every rule eligible, and lists every rule it checked', () => {
    const result = evaluateEligibility(investor, strict, context);
    expect(result.result).toBe('ELIGIBLE');
    expect(result.rulesVersion).toBe('engine-1/rules-3');
    expect(result.rules.map((rule) => rule.code)).toEqual([
      'PROFILE_INACTIVE',
      'INVESTOR_SUSPENDED',
      'INVESTOR_NOT_ELIGIBLE',
      'KYC_NOT_APPROVED',
      'KYC_EXPIRED',
      'KYC_EXPIRES_TOO_SOON',
      'NOT_PROFESSIONAL',
      'CLASSIFICATION_INCOMPATIBLE',
      'INVESTOR_TYPE_NOT_ALLOWED',
      'COUNTRY_EXCLUDED',
      'COUNTRY_NOT_ALLOWED',
      'MAX_INVESTORS_REACHED',
    ]);
    expect(result.rules.every((rule) => rule.passed)).toBe(true);
  });

  it('only checks the rules the rule set asks for', () => {
    const result = evaluateEligibility({ ...investor, kycStatus: 'NOT_STARTED' }, open, context);
    expect(result.result).toBe('ELIGIBLE');
    expect(result.rules.map((rule) => rule.code)).toEqual([
      'PROFILE_INACTIVE',
      'INVESTOR_SUSPENDED',
      'INVESTOR_NOT_ELIGIBLE',
      'COUNTRY_EXCLUDED',
    ]);
  });

  // One case per failure code: the investor or rule set breaks exactly that rule.
  const cases: [
    EligibilityRuleCode,
    Partial<EligibilityInvestor>,
    Partial<EligibilityRuleSet>?,
    Partial<EligibilityContext>?,
  ][] = [
    ['PROFILE_INACTIVE', { profileStatus: 'DRAFT' }],
    ['INVESTOR_SUSPENDED', { eligibilityStatus: 'SUSPENDED' }],
    ['INVESTOR_NOT_ELIGIBLE', { eligibilityStatus: 'NOT_ELIGIBLE' }],
    ['KYC_NOT_APPROVED', { kycStatus: 'PENDING_REVIEW', kycExpiryDate: null }],
    ['KYC_EXPIRED', { kycStatus: 'EXPIRED', kycExpiryDate: '2026-09-01' }],
    ['KYC_EXPIRES_TOO_SOON', { kycExpiryDate: '2026-12-01' }],
    [
      'CLASSIFICATION_INCOMPATIBLE',
      { classification: 'ELIGIBLE_COUNTERPARTY' },
      { allowedClassifications: ['PROFESSIONAL'] },
    ],
    ['INVESTOR_TYPE_NOT_ALLOWED', { type: 'NATURAL_PERSON' }],
    ['COUNTRY_EXCLUDED', { countryOfIncorporation: 'US' }],
    ['COUNTRY_NOT_ALLOWED', { countryOfIncorporation: 'CH' }],
    ['MAX_INVESTORS_REACHED', {}, {}, { currentInvestorCount: 10 }],
  ];

  it.each(cases)(
    'fails with %s alone when only that rule is broken',
    (code, facts, rules, more) => {
      expect(failures(facts, rules, more)).toEqual([code]);
    },
  );

  it('covers every rule code except NOT_PROFESSIONAL with a failing case', () => {
    // No classification of the MVP is non-professional; the rule is kept for later classifications.
    const covered = new Set(cases.map(([code]) => code));
    expect(ELIGIBILITY_RULE_CODES.filter((code) => !covered.has(code))).toEqual([
      'NOT_PROFESSIONAL',
    ]);
  });

  it('reports every failed rule, not only the first one', () => {
    expect(
      failures({ countryOfIncorporation: 'US', kycStatus: 'EXPIRED', profileStatus: 'INACTIVE' }),
    ).toEqual(['PROFILE_INACTIVE', 'KYC_EXPIRED', 'COUNTRY_EXCLUDED']);
  });

  it('treats an approval whose date has passed as expired, even before the daily job runs', () => {
    expect(failures({ kycStatus: 'APPROVED', kycExpiryDate: '2026-09-24' })).toEqual([
      'KYC_EXPIRED',
    ]);
    expect(failures({ kycStatus: 'APPROVED', kycExpiryDate: null })).toEqual(['KYC_EXPIRED']);
  });

  it('accepts a KYC valid until today, and exactly the minimum remaining validity', () => {
    expect(failures({ kycExpiryDate: TODAY }, { kycMinRemainingValidityDays: 0 })).toEqual([]);
    expect(failures({ kycExpiryDate: '2026-12-24' }, { kycMinRemainingValidityDays: 90 })).toEqual(
      [],
    );
    expect(failures({ kycExpiryDate: '2026-12-23' }, { kycMinRemainingValidityDays: 90 })).toEqual([
      'KYC_EXPIRES_TOO_SOON',
    ]);
  });

  it('explains each outcome with values the interface can show', () => {
    const result = evaluateEligibility(
      { ...investor, countryOfIncorporation: 'US', kycExpiryDate: '2026-12-01' },
      strict,
      context,
    );
    expect(result.rules.find((rule) => rule.code === 'COUNTRY_EXCLUDED')).toEqual({
      code: 'COUNTRY_EXCLUDED',
      passed: false,
      detail: { country: 'US' },
    });
    expect(result.rules.find((rule) => rule.code === 'KYC_EXPIRES_TOO_SOON')?.detail).toEqual({
      expiryDate: '2026-12-01',
      requiredUntil: '2026-12-24',
    });
  });

  it('never counts an existing investor against the maximum', () => {
    expect(failures({}, {}, { currentInvestorCount: 10, alreadyInvestor: true })).toEqual([]);
    expect(failures({}, { maxInvestors: null }, { currentInvestorCount: 10_000 })).toEqual([]);
  });

  it('gives the same result for the same facts (pure function)', () => {
    const facts = { ...investor, countryOfIncorporation: 'US' };
    expect(evaluateEligibility(facts, strict, context)).toEqual(
      evaluateEligibility(facts, strict, context),
    );
  });
});
