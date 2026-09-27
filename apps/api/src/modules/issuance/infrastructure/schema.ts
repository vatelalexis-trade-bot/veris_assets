// Tables of the issuance module (docs/DATA_MODEL.md §3.4). Amounts are NUMERIC (never floats),
// in the issuance's currency; they may be empty while the issuance is a draft.
import { sql } from 'drizzle-orm';
import {
  boolean,
  char,
  check,
  date,
  index,
  integer,
  numeric,
  pgSchema,
  primaryKey,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { auditColumns, id, tenantId, utcTimestamp } from '../../../core/database/columns.js';
import { country, currency, document } from '../../../core/database/schema.js';
import { tenant } from '../../iam/index.js';
import { investor } from '../../investor-compliance/index.js';

export const issuanceSchema = pgSchema('issuance');

const amount = () => numeric({ precision: 24, scale: 4 });

/** An issuance (SPEC §6.2 step 1) and its status (SPEC §7). */
export const issuance = issuanceSchema.table(
  'issuance',
  {
    id: id(),
    tenantId: tenantId().references(() => tenant.id),
    name: text().notNull(),
    /** Short code, unique in the tenant (e.g. HELIOS27). */
    code: text().notNull(),
    description: text(),
    assetCategory: text(),
    countryCode: char({ length: 2 }).references(() => country.code),
    currency: char({ length: 3 }).references(() => currency.code),
    legalIssuerName: text(),
    spvName: text(),
    illustrationDocumentId: uuid().references(() => document.id),
    status: text().notNull().default('DRAFT'),
    /** Last step reached in the wizard, to take the user back there. */
    wizardStep: text().notNull().default('GENERAL'),
    submittedBy: uuid(),
    submittedAt: utcTimestamp(),
    approvedBy: uuid(),
    approvedAt: utcTimestamp(),
    statusComment: text(),
    ...auditColumns(),
  },
  (table) => [
    unique('issuance_code').on(table.tenantId, table.code),
    check(
      'issuance_status',
      sql`${table.status} IN ('DRAFT', 'UNDER_REVIEW', 'APPROVED', 'SUBSCRIPTION_OPEN', 'SUBSCRIPTION_CLOSED', 'ALLOCATED', 'ACTIVE', 'MATURED', 'CANCELLED')`,
    ),
    index('issuance_tenant_status').on(table.tenantId, table.status),
  ],
);

/** Financial terms (step 2) and servicing (step 4). */
export const issuanceTerms = issuanceSchema.table(
  'issuance_terms',
  {
    issuanceId: uuid()
      .primaryKey()
      .references(() => issuance.id),
    tenantId: tenantId(),
    targetAmount: amount(),
    minimumAmount: amount(),
    maximumAmount: amount(),
    nominalValue: amount(),
    /** Whole units (checked at submission). */
    totalUnits: numeric({ precision: 20, scale: 0 }),
    /** Fraction: 0.05 for 5 %. */
    interestRate: numeric({ precision: 9, scale: 6 }),
    rateType: text().default('FIXED'),
    distributionFrequency: text(),
    dayCount: text(),
    issueDate: date(),
    maturityDate: date(),
    subscriptionStartDate: date(),
    subscriptionEndDate: date(),
    minSubscriptionAmount: amount(),
    maxAmountPerInvestor: amount(),
    gracePeriodDays: integer().notNull().default(0),
    principalRepayment: text().notNull().default('AT_MATURITY'),
    roundingMethod: text().notNull().default('HALF_EVEN'),
    businessDayConvention: text().notNull().default('FOLLOWING'),
    /** Record date = payment date minus this many business days (decision D-012). */
    recordDateOffsetBusinessDays: integer().notNull().default(1),
    earlyRedemptionAllowed: boolean().notNull().default(false),
    ...auditColumns(),
  },
  (table) => [
    check('issuance_terms_grace', sql`${table.gracePeriodDays} >= 0`),
    check('issuance_terms_record_offset', sql`${table.recordDateOffsetBusinessDays} >= 0`),
  ],
);

/** Eligibility rules (step 3); changed only while the issuance is a draft. */
export const eligibilityRuleSet = issuanceSchema.table(
  'eligibility_rule_set',
  {
    issuanceId: uuid()
      .primaryKey()
      .references(() => issuance.id),
    tenantId: tenantId(),
    professionalOnly: boolean().notNull().default(true),
    allowedCountries: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    excludedCountries: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    allowedInvestorTypes: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    allowedClassifications: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    kycRequired: boolean().notNull().default(true),
    kycMinRemainingValidityDays: integer().notNull().default(0),
    transfersAllowed: boolean().notNull().default(false),
    manualTransferApproval: boolean().notNull().default(true),
    maxInvestors: integer(),
    /** Transfers are refused before this date (decision D-014). */
    lockupEndDate: date(),
    rulesVersion: integer().notNull().default(1),
    ...auditColumns(),
  },
  (table) => [
    check('eligibility_rule_set_kyc_days', sql`${table.kycMinRemainingValidityDays} >= 0`),
    check(
      'eligibility_rule_set_max_investors',
      sql`${table.maxInvestors} IS NULL OR ${table.maxInvestors} > 0`,
    ),
  ],
);

/** Documents of an issuance (step 5); the files are core documents. */
export const issuanceDocument = issuanceSchema.table(
  'issuance_document',
  {
    issuanceId: uuid()
      .notNull()
      .references(() => issuance.id),
    documentId: uuid()
      .notNull()
      .references(() => document.id),
    tenantId: tenantId(),
    kind: text().notNull(),
    createdAt: utcTimestamp().notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.issuanceId, table.documentId] })],
);

/** Whitelist of an issuance (SPEC §8.4): the investors invited, each after an eligibility check. */
export const investorInvitation = issuanceSchema.table(
  'investor_invitation',
  {
    id: id(),
    tenantId: tenantId(),
    issuanceId: uuid()
      .notNull()
      .references(() => issuance.id),
    investorId: uuid()
      .notNull()
      .references(() => investor.id),
    status: text().notNull().default('INVITED'),
    /** The eligibility decision the invitation was made with. */
    eligibilityAssessmentId: uuid().notNull(),
    invitedBy: uuid().notNull(),
    invitedAt: utcTimestamp().notNull().defaultNow(),
    revokedBy: uuid(),
    revokedAt: utcTimestamp(),
    ...auditColumns(),
  },
  (table) => [
    unique('investor_invitation_once').on(table.issuanceId, table.investorId),
    check('investor_invitation_status', sql`${table.status} IN ('INVITED', 'REVOKED')`),
    // The opportunities of an investor (SPEC §14.2).
    index('investor_invitation_investor').on(table.investorId),
  ],
);
