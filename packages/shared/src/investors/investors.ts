/**
 * Investors, KYC/KYB and documents (SPEC §8, §16, docs/DATA_MODEL.md §3.1 and §3.3): the values
 * shared by the API (validation, database checks) and the web app (forms, filters).
 */

/** Legal entities first (professional investors); natural persons are rare in the MVP. */
export const INVESTOR_TYPES = ['LEGAL_ENTITY', 'NATURAL_PERSON'] as const;
export type InvestorType = (typeof INVESTOR_TYPES)[number];

/** Same codes as the reference data `INVESTOR_CLASSIFICATION`. */
export const INVESTOR_CLASSIFICATIONS = ['PROFESSIONAL', 'ELIGIBLE_COUNTERPARTY'] as const;
export type InvestorClassification = (typeof INVESTOR_CLASSIFICATIONS)[number];

export const PROFILE_STATUSES = ['DRAFT', 'ACTIVE', 'INACTIVE'] as const;
export type ProfileStatus = (typeof PROFILE_STATUSES)[number];

/** SPEC §8.2. `NOT_STARTED` is the status of an investor without any case. */
export const KYC_STATUSES = [
  'NOT_STARTED',
  'IN_PROGRESS',
  'PENDING_REVIEW',
  'APPROVED',
  'REJECTED',
  'EXPIRED',
] as const;
export type KycStatus = (typeof KYC_STATUSES)[number];

/** Statuses of a case (a case starts IN_PROGRESS). */
export const KYC_CASE_STATUSES = KYC_STATUSES.filter(
  (status): status is Exclude<KycStatus, 'NOT_STARTED'> => status !== 'NOT_STARTED',
);
export type KycCaseStatus = Exclude<KycStatus, 'NOT_STARTED'>;

/** SPEC §8.3; decided in phase 9 (eligibility engine). */
export const ELIGIBILITY_STATUSES = [
  'NOT_ASSESSED',
  'ELIGIBLE',
  'NOT_ELIGIBLE',
  'SUSPENDED',
] as const;
export type EligibilityStatus = (typeof ELIGIBILITY_STATUSES)[number];

/** Simulated risk level (SPEC §8.1), suggested by the fictitious KYC provider. */
export const RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

/** Validity of an approved KYC/KYB case, in months. */
export const KYC_VALIDITY_MONTHS = 12;
/** Days before expiry when the investor and the Compliance Officers are warned (SPEC §8.2). */
export const KYC_EXPIRY_WARNING_DAYS = 30;

// Documents (SPEC §16)

export const DOCUMENT_TYPES = [
  'ISSUANCE_DOCUMENT',
  'INVESTOR_DOCUMENT',
  'KYC_EVIDENCE',
  'SUBSCRIPTION_FORM',
  'ALLOCATION_CONFIRMATION',
  'POSITION_STATEMENT',
  'COUPON_NOTICE',
  'REPORT',
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/**
 * Who may read a document: the investor it concerns (`INVESTOR_VISIBLE`), the issuer's staff only
 * (`INTERNAL`), or those with the `document:read-confidential` permission (`CONFIDENTIAL`).
 */
export const DOCUMENT_CONFIDENTIALITY = ['INVESTOR_VISIBLE', 'INTERNAL', 'CONFIDENTIAL'] as const;
export type DocumentConfidentiality = (typeof DOCUMENT_CONFIDENTIALITY)[number];

/** Allowed file types, detected from the content (SPEC §16: PDF, PNG, JPEG, CSV, XLSX). */
export const ALLOWED_DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
] as const;
export type DocumentMimeType = (typeof ALLOWED_DOCUMENT_MIME_TYPES)[number];

/** 10 MB (SPEC §16). */
export const MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024;
