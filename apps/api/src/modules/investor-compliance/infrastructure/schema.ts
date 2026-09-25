// Tables of the investor-compliance module (docs/DATA_MODEL.md §3.3). Personal data [DP] lives in
// separate tables that the registry never references (SPEC §8.5).
import { sql } from 'drizzle-orm';
import {
  boolean,
  char,
  check,
  date,
  index,
  jsonb,
  numeric,
  pgSchema,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { auditColumns, id, tenantId, utcTimestamp } from '../../../core/database/columns.js';
import { country, document } from '../../../core/database/schema.js';
import { tenant } from '../../iam/index.js';

export const investorSchema = pgSchema('investor');

/** Profile of an investor (SPEC §8.1). The KYC status is a copy of the current case's status. */
export const investor = investorSchema.table(
  'investor',
  {
    id: id(),
    tenantId: tenantId().references(() => tenant.id),
    type: text().notNull(),
    legalName: text().notNull(),
    tradeName: text(),
    legalForm: text(),
    registrationNumber: text(),
    taxId: text(),
    countryOfIncorporation: char({ length: 2 })
      .notNull()
      .references(() => country.code),
    /** `{ line1, line2, postalCode, city, countryCode }`. */
    address: jsonb(),
    contactEmail: text(),
    phone: text(),
    classification: text().notNull(),
    profileStatus: text().notNull().default('DRAFT'),
    kycStatus: text().notNull().default('NOT_STARTED'),
    kycLastReviewDate: date(),
    kycExpiryDate: date(),
    riskLevel: text(),
    eligibilityStatus: text().notNull().default('NOT_ASSESSED'),
    /** Code given to a sender of a transfer, never the identity (decision D-010). */
    recipientCode: text().notNull(),
    ...auditColumns(),
  },
  (table) => [
    unique('investor_recipient_code').on(table.tenantId, table.recipientCode),
    check('investor_type', sql`${table.type} IN ('LEGAL_ENTITY', 'NATURAL_PERSON')`),
    check(
      'investor_classification',
      sql`${table.classification} IN ('PROFESSIONAL', 'ELIGIBLE_COUNTERPARTY')`,
    ),
    check(
      'investor_profile_status',
      sql`${table.profileStatus} IN ('DRAFT', 'ACTIVE', 'INACTIVE')`,
    ),
    check(
      'investor_kyc_status',
      sql`${table.kycStatus} IN ('NOT_STARTED', 'IN_PROGRESS', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'EXPIRED')`,
    ),
    check(
      'investor_eligibility_status',
      sql`${table.eligibilityStatus} IN ('NOT_ASSESSED', 'ELIGIBLE', 'NOT_ELIGIBLE', 'SUSPENDED')`,
    ),
    check('investor_risk_level', sql`${table.riskLevel} IN ('LOW', 'MEDIUM', 'HIGH')`),
    index('investor_tenant_legal_name').on(table.tenantId, table.legalName),
  ],
);

/** Legal representative of a legal entity [DP]. */
export const investorRepresentative = investorSchema.table('investor_representative', {
  id: id(),
  tenantId: tenantId(),
  investorId: uuid()
    .notNull()
    .references(() => investor.id),
  fullName: text().notNull(),
  title: text(),
  email: text(),
  phone: text(),
  dateOfBirth: date(),
  /** Set when the person's data has been replaced by a pseudonym (SPEC §8.5). */
  pseudonymizedAt: utcTimestamp(),
  ...auditColumns(),
});

/** Beneficial owner (fictitious) [DP]. */
export const beneficialOwner = investorSchema.table(
  'beneficial_owner',
  {
    id: id(),
    tenantId: tenantId(),
    investorId: uuid()
      .notNull()
      .references(() => investor.id),
    fullName: text().notNull(),
    nationality: char({ length: 2 }).references(() => country.code),
    /** Percentage of ownership, 0 to 100, as a decimal (never a float). */
    ownershipPercentage: numeric({ precision: 5, scale: 2 }).notNull(),
    dateOfBirth: date(),
    pseudonymizedAt: utcTimestamp(),
    ...auditColumns(),
  },
  (table) => [
    check(
      'beneficial_owner_percentage',
      sql`${table.ownershipPercentage} > 0 AND ${table.ownershipPercentage} <= 100`,
    ),
  ],
);

/** KYC/KYB case (SPEC §8.2): prepared by the issuer's staff, decided by a Compliance Officer. */
export const kycCase = investorSchema.table(
  'kyc_case',
  {
    id: id(),
    tenantId: tenantId(),
    investorId: uuid()
      .notNull()
      .references(() => investor.id),
    status: text().notNull().default('IN_PROGRESS'),
    preparedBy: uuid().notNull(),
    preparedAt: utcTimestamp().notNull().defaultNow(),
    decidedBy: uuid(),
    decidedAt: utcTimestamp(),
    decisionComment: text(),
    /** Last day of validity of an approved case. */
    validUntil: date(),
    /** Answer of the (fictitious) KYC provider when the case was submitted for review. */
    providerReference: text(),
    providerOutcome: text(),
    suggestedRiskLevel: text(),
    /** When the investor and the Compliance Officers were warned of the coming expiry. */
    expiryWarningSentAt: utcTimestamp(),
    ...auditColumns(),
  },
  (table) => [
    // Four-eyes principle (SPEC §4.8): the person who decides never prepared the case.
    check(
      'kyc_case_four_eyes',
      sql`${table.decidedBy} IS NULL OR ${table.decidedBy} <> ${table.preparedBy}`,
    ),
    check(
      'kyc_case_status',
      sql`${table.status} IN ('IN_PROGRESS', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'EXPIRED')`,
    ),
    check('kyc_case_provider_outcome', sql`${table.providerOutcome} IN ('CLEAR', 'REVIEW')`),
    // At most one open case per investor.
    uniqueIndex('kyc_case_one_open_per_investor')
      .on(table.investorId)
      .where(sql`${table.status} IN ('IN_PROGRESS', 'PENDING_REVIEW')`),
    index('kyc_case_tenant_status').on(table.tenantId, table.status),
  ],
);

/** Evidence attached to a KYC case (the file is a core document). */
export const kycDocument = investorSchema.table(
  'kyc_document',
  {
    id: id(),
    tenantId: tenantId(),
    kycCaseId: uuid()
      .notNull()
      .references(() => kycCase.id),
    documentId: uuid()
      .notNull()
      .references(() => document.id),
    kind: text().notNull(),
    createdAt: utcTimestamp().notNull().defaultNow(),
  },
  (table) => [unique('kyc_document_once').on(table.kycCaseId, table.documentId)],
);

/** Comment of a Compliance Officer on an investor or one of its cases. Append-only. */
export const complianceComment = investorSchema.table('compliance_comment', {
  id: id(),
  tenantId: tenantId(),
  investorId: uuid()
    .notNull()
    .references(() => investor.id),
  resourceType: text().notNull(),
  resourceId: uuid().notNull(),
  authorUserId: uuid().notNull(),
  body: text().notNull(),
  createdAt: utcTimestamp().notNull().defaultNow(),
});

/**
 * Every eligibility decision (SPEC §8.4): the engine's at invitation, subscription and transfer
 * time, and the Compliance Officer's manual ones. Append-only: a decision is never changed.
 */
export const eligibilityAssessment = investorSchema.table(
  'eligibility_assessment',
  {
    id: id(),
    tenantId: tenantId(),
    investorId: uuid()
      .notNull()
      .references(() => investor.id),
    /** Null for a manual decision about the investor as a whole. */
    issuanceId: uuid(),
    context: text().notNull(),
    result: text().notNull(),
    /** `[{ code, passed, detail }]`, in evaluation order. */
    rules: jsonb().notNull(),
    /** The rule set that was applied (null for a manual decision). */
    ruleSet: jsonb(),
    rulesVersion: text().notNull(),
    decidedByUserId: uuid(),
    decidedBySystem: boolean().notNull(),
    justification: text(),
    assessedAt: utcTimestamp().notNull().defaultNow(),
  },
  (table) => [
    check(
      'eligibility_assessment_context',
      sql`${table.context} IN ('INVITATION', 'SUBSCRIPTION', 'TRANSFER', 'MANUAL')`,
    ),
    check('eligibility_assessment_result', sql`${table.result} IN ('ELIGIBLE', 'NOT_ELIGIBLE')`),
    // A decision is made either by the system or by a person, never by nobody.
    check(
      'eligibility_assessment_decider',
      sql`${table.decidedBySystem} OR ${table.decidedByUserId} IS NOT NULL`,
    ),
    index('eligibility_assessment_investor').on(table.tenantId, table.investorId, table.assessedAt),
  ],
);
