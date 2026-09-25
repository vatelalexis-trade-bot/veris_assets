// Codes returned in `error.details` to explain which rule failed.

/** Eligibility engine rules (SPEC §8.4, docs/API.md §1.3). */
export const ELIGIBILITY_RULE_CODES = [
  'PROFILE_INACTIVE',
  'KYC_NOT_APPROVED',
  'KYC_EXPIRED',
  'KYC_EXPIRES_TOO_SOON',
  'CLASSIFICATION_INCOMPATIBLE',
  'INVESTOR_TYPE_NOT_ALLOWED',
  'NOT_PROFESSIONAL',
  'COUNTRY_EXCLUDED',
  'COUNTRY_NOT_ALLOWED',
  'INVESTOR_SUSPENDED',
  'INVESTOR_NOT_ELIGIBLE',
  'MAX_INVESTORS_REACHED',
] as const;

export type EligibilityRuleCode = (typeof ELIGIBILITY_RULE_CODES)[number];

/** Issuance consistency checks at submission (SPEC §6.3, docs/DATA_MODEL.md §3.4). */
export const ISSUANCE_TERMS_RULE_CODES = [
  'TARGET_NOT_EQUAL_NOMINAL_TIMES_UNITS',
  'MIN_TARGET_MAX_ORDER',
  'MIN_SUBSCRIPTION_ABOVE_MAX_PER_INVESTOR',
  'DATE_ORDER_INVALID',
  'COUNTRY_BOTH_ALLOWED_AND_EXCLUDED',
  'NEGATIVE_RATE',
  'RATE_TYPE_NOT_SUPPORTED',
  'FREQUENCY_NOT_SUPPORTED',
  'UNITS_NOT_INTEGER',
] as const;

export type IssuanceTermsRuleCode = (typeof ISSUANCE_TERMS_RULE_CODES)[number];
