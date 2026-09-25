/**
 * Issuances (SPEC §6, §7, docs/DATA_MODEL.md §3.4): the values shared by the API (validation,
 * database checks) and the web app (wizard).
 */

/** SPEC §7. */
export const ISSUANCE_STATUSES = [
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
export type IssuanceStatus = (typeof ISSUANCE_STATUSES)[number];

/** Same codes as the reference data `ASSET_CATEGORY`. */
export const ASSET_CATEGORIES = [
  'PRIVATE_DEBT',
  'RENEWABLE_ENERGY',
  'REAL_ESTATE',
  'INFRASTRUCTURE',
  'PRIVATE_EQUITY',
] as const;
export type AssetCategory = (typeof ASSET_CATEGORIES)[number];

/** Only fixed rates in the MVP (SPEC §6.3). */
export const RATE_TYPES = ['FIXED'] as const;
export type RateType = (typeof RATE_TYPES)[number];

export const DISTRIBUTION_FREQUENCIES = [
  'MONTHLY',
  'QUARTERLY',
  'SEMI_ANNUAL',
  'ANNUAL',
  'BULLET',
] as const;
export type DistributionFrequency = (typeof DISTRIBUTION_FREQUENCIES)[number];

/** Day count conventions (decision D-011: 30/360 is 30E/360). */
export const DAY_COUNTS = ['ACT_365F', '30E_360'] as const;
export type DayCount = (typeof DAY_COUNTS)[number];

export const ROUNDING_METHODS = ['HALF_EVEN', 'HALF_UP', 'DOWN'] as const;

export const BUSINESS_DAY_CONVENTIONS = ['FOLLOWING', 'NONE'] as const;
export type BusinessDayConvention = (typeof BUSINESS_DAY_CONVENTIONS)[number];

export const PRINCIPAL_REPAYMENTS = ['AT_MATURITY'] as const;

/** Documents of an issuance (wizard step 5). */
export const ISSUANCE_DOCUMENT_KINDS = [
  'TERM_SHEET',
  'MEMORANDUM',
  'TERMS_AND_CONDITIONS',
  'MARKETING',
  'INVESTOR_DOCUMENT',
] as const;
export type IssuanceDocumentKind = (typeof ISSUANCE_DOCUMENT_KINDS)[number];

/** The six steps of the creation wizard (SPEC §6.2). */
export const ISSUANCE_WIZARD_STEPS = [
  'GENERAL',
  'FINANCIAL',
  'ELIGIBILITY',
  'SERVICING',
  'DOCUMENTS',
  'REVIEW',
] as const;
export type IssuanceWizardStep = (typeof ISSUANCE_WIZARD_STEPS)[number];

export const INVITATION_STATUSES = ['INVITED', 'REVOKED'] as const;
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];
