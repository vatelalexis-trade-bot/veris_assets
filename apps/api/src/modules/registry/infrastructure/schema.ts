// Tables of the registry module (docs/DATA_MODEL.md §3.5). Phase 11: subscriptions; phase 12:
// allocation rounds, logical accounts, positions and the append-only ledger. Amounts are NUMERIC
// in the issuance's currency; units are whole numbers stored as NUMERIC (SPEC §10.5).
import { sql } from 'drizzle-orm';
import {
  bigint,
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
import { tenant } from '../../iam/index.js';
import { investor } from '../../investor-compliance/index.js';
import { issuance } from '../../issuance/index.js';

export const registrySchema = pgSchema('registry');

/** A subscription request of an investor (SPEC §9). */
export const subscription = registrySchema.table(
  'subscription',
  {
    id: id(),
    tenantId: tenantId().references(() => tenant.id),
    issuanceId: uuid()
      .notNull()
      .references(() => issuance.id),
    investorId: uuid()
      .notNull()
      .references(() => investor.id),
    status: text().notNull().default('DRAFT'),
    requestedUnits: numeric({ precision: 20, scale: 0 }).notNull(),
    requestedAmount: numeric({ precision: 24, scale: 4 }).notNull(),
    currency: char({ length: 3 }).notNull(),
    /** Decided at allocation (phase 12). */
    allocatedUnits: numeric({ precision: 20, scale: 0 }),
    amountDue: numeric({ precision: 24, scale: 4 }),
    /** Fictitious account or reference given by the investor (SPEC §9.1). */
    paymentReference: text(),
    documentsAcceptedAt: utcTimestamp(),
    eligibilityDeclaredAt: utcTimestamp(),
    comment: text(),
    submittedAt: utcTimestamp(),
    /** The eligibility decision recorded when it was submitted (then when it was approved). */
    eligibilityAssessmentId: uuid(),
    reviewedBy: uuid(),
    decidedBy: uuid(),
    decidedAt: utcTimestamp(),
    rejectionReason: text(),
    cancellationReason: text(),
    ...auditColumns(),
  },
  (table) => [
    check(
      'subscription_status',
      sql`${table.status} IN ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'PAYMENT_PENDING', 'PAYMENT_CONFIRMED', 'ALLOCATED', 'CANCELLED')`,
    ),
    check('subscription_units_positive', sql`${table.requestedUnits} > 0`),
    check('subscription_amount_positive', sql`${table.requestedAmount} > 0`),
    index('subscription_issuance_status').on(table.tenantId, table.issuanceId, table.status),
    index('subscription_investor').on(table.tenantId, table.investorId),
  ],
);

/** Quantity of units: decimal in the database, whole numbers in the MVP (SPEC §10.5). */
const units = () => numeric({ precision: 20, scale: 4 });

/** A round of manual allocation of an issuance, validated with four eyes (SPEC §10.1). */
export const allocationRound = registrySchema.table(
  'allocation_round',
  {
    id: id(),
    tenantId: tenantId().references(() => tenant.id),
    issuanceId: uuid()
      .notNull()
      .references(() => issuance.id),
    status: text().notNull().default('DRAFT'),
    method: text().notNull().default('MANUAL'),
    ruleApplied: text(),
    totalAllocatedUnits: units().notNull().default('0'),
    /** Minimum amount not reached: why the allocation goes on anyway (decision D-013). */
    minimumWaiverJustification: text(),
    proposedBy: uuid(),
    proposedAt: utcTimestamp(),
    validatedBy: uuid(),
    validatedAt: utcTimestamp(),
    rejectionComment: text(),
    ...auditColumns(),
  },
  (table) => [
    check(
      'allocation_round_status',
      sql`${table.status} IN ('DRAFT', 'PROPOSED', 'VALIDATED', 'REJECTED')`,
    ),
    check('allocation_round_method', sql`${table.method} IN ('MANUAL')`),
    check('allocation_round_four_eyes', sql`${table.validatedBy} <> ${table.proposedBy}`),
    // One round in progress or validated per issuance; rejected ones stay in the history.
    uniqueIndex('allocation_round_one_active')
      .on(table.issuanceId)
      .where(sql`${table.status} <> 'REJECTED'`),
  ],
);

/** The units given to one subscription in a round. */
export const allocation = registrySchema.table(
  'allocation',
  {
    id: id(),
    tenantId: tenantId().references(() => tenant.id),
    allocationRoundId: uuid()
      .notNull()
      .references(() => allocationRound.id),
    subscriptionId: uuid()
      .notNull()
      .references(() => subscription.id),
    investorId: uuid()
      .notNull()
      .references(() => investor.id),
    allocatedUnits: units().notNull(),
    amount: numeric({ precision: 24, scale: 4 }).notNull(),
    currency: char({ length: 3 }).notNull(),
    ...auditColumns(),
  },
  (table) => [
    check('allocation_units_not_negative', sql`${table.allocatedUnits} >= 0`),
    unique('allocation_round_subscription').on(table.allocationRoundId, table.subscriptionId),
  ],
);

/** A logical account of an issuance: the issuer's treasury or one investor (docs/ARCHITECTURE.md §4.6). */
export const logicalAccount = registrySchema.table(
  'logical_account',
  {
    id: id(),
    tenantId: tenantId().references(() => tenant.id),
    issuanceId: uuid()
      .notNull()
      .references(() => issuance.id),
    /** Null for the treasury. */
    investorId: uuid().references(() => investor.id),
    type: text().notNull(),
    status: text().notNull().default('ACTIVE'),
    createdAt: utcTimestamp().notNull().defaultNow(),
  },
  (table) => [
    check('logical_account_type', sql`${table.type} IN ('ISSUER_TREASURY', 'INVESTOR')`),
    check('logical_account_status', sql`${table.status} IN ('ACTIVE', 'FROZEN')`),
    check(
      'logical_account_owner',
      sql`(${table.type} = 'ISSUER_TREASURY') = (${table.investorId} IS NULL)`,
    ),
    // One treasury and one account per investor on each issuance.
    unique('logical_account_owner_unique')
      .on(table.issuanceId, table.investorId)
      .nullsNotDistinct(),
  ],
);

/**
 * Holding of an account (SPEC §10.2). Only the LedgerWriter changes it, in the transaction of the
 * ledger entries; the database refuses negative or inconsistent quantities (invariant 1).
 */
export const position = registrySchema.table(
  'position',
  {
    id: id(),
    tenantId: tenantId().references(() => tenant.id),
    issuanceId: uuid()
      .notNull()
      .references(() => issuance.id),
    accountId: uuid()
      .notNull()
      .unique()
      .references(() => logicalAccount.id),
    investorId: uuid().references(() => investor.id),
    quantityHeld: units().notNull().default('0'),
    quantityBlocked: units().notNull().default('0'),
    quantityAvailable: units()
      .notNull()
      .generatedAlwaysAs(sql`quantity_held - quantity_blocked`),
    acquisitionAmount: numeric({ precision: 24, scale: 4 }).notNull().default('0'),
    currency: char({ length: 3 }).notNull(),
    version: bigint({ mode: 'number' }).notNull().default(1),
    createdAt: utcTimestamp().notNull().defaultNow(),
    updatedAt: utcTimestamp().notNull().defaultNow(),
  },
  (table) => [
    check('position_held_not_negative', sql`${table.quantityHeld} >= 0`),
    check('position_blocked_not_negative', sql`${table.quantityBlocked} >= 0`),
    check('position_blocked_within_held', sql`${table.quantityBlocked} <= ${table.quantityHeld}`),
    check('position_acquisition_not_negative', sql`${table.acquisitionAmount} >= 0`),
    index('position_issuance').on(table.tenantId, table.issuanceId),
    index('position_investor').on(table.tenantId, table.investorId),
  ],
);

/** Last sequence and hash of an issuance's ledger: locked by every write, which serialises them. */
export const ledgerHead = registrySchema.table('ledger_head', {
  issuanceId: uuid()
    .primaryKey()
    .references(() => issuance.id),
  tenantId: tenantId().references(() => tenant.id),
  lastSequence: bigint({ mode: 'number' }).notNull().default(0),
  lastHash: text().notNull(),
});

/**
 * Append-only movements (SPEC §10.3): never updated nor deleted, which the database enforces.
 * Each one carries the hash of the previous one of the same issuance (invariant 5). No personal
 * data: accounts and identifiers only.
 */
export const ledgerEntry = registrySchema.table(
  'ledger_entry',
  {
    id: id(),
    tenantId: tenantId().references(() => tenant.id),
    issuanceId: uuid()
      .notNull()
      .references(() => issuance.id),
    sequenceNo: bigint({ mode: 'number' }).notNull(),
    type: text().notNull(),
    sourceAccountId: uuid().references(() => logicalAccount.id),
    destinationAccountId: uuid().references(() => logicalAccount.id),
    quantity: units().notNull(),
    effectiveDate: date().notNull(),
    recordedAt: utcTimestamp().notNull(),
    businessReference: text().notNull(),
    status: text().notNull().default('POSTED'),
    reversesEntryId: uuid(),
    previousHash: text().notNull(),
    entryHash: text().notNull(),
    initiatedByUserId: uuid(),
    initiatedByService: text(),
    metadata: jsonb().$type<Record<string, string>>().notNull().default({}),
    correlationId: text(),
  },
  (table) => [
    check(
      'ledger_entry_type',
      sql`${table.type} IN ('ISSUANCE', 'ALLOCATION', 'TRANSFER', 'BLOCK', 'UNBLOCK', 'REDEMPTION', 'CANCELLATION', 'CORRECTION')`,
    ),
    check('ledger_entry_status', sql`${table.status} IN ('POSTED')`),
    check('ledger_entry_quantity_positive', sql`${table.quantity} > 0`),
    check(
      'ledger_entry_has_account',
      sql`${table.sourceAccountId} IS NOT NULL OR ${table.destinationAccountId} IS NOT NULL`,
    ),
    unique('ledger_entry_sequence').on(table.issuanceId, table.sequenceNo),
    index('ledger_entry_source').on(table.tenantId, table.sourceAccountId),
    index('ledger_entry_destination').on(table.tenantId, table.destinationAccountId),
  ],
);

/**
 * Fictitious payment of a subscription (SPEC §9.2, D-009): prepared by the issuer's staff for the
 * amount due, then confirmed by an Issuer Administrator other than the preparer (four eyes). No
 * real payment is ever made (SPEC §31.2).
 */
export const subscriptionPayment = registrySchema.table(
  'subscription_payment',
  {
    id: id(),
    tenantId: tenantId().references(() => tenant.id),
    subscriptionId: uuid()
      .notNull()
      .unique()
      .references(() => subscription.id),
    amount: numeric({ precision: 24, scale: 4 }).notNull(),
    currency: char({ length: 3 }).notNull(),
    status: text().notNull().default('PENDING'),
    preparedBy: uuid(),
    preparedAt: utcTimestamp(),
    confirmedBy: uuid(),
    confirmedAt: utcTimestamp(),
    providerReference: text(),
    ...auditColumns(),
  },
  (table) => [
    check(
      'subscription_payment_status',
      sql`${table.status} IN ('PENDING', 'PREPARED', 'CONFIRMED', 'FAILED')`,
    ),
    check('subscription_payment_amount_positive', sql`${table.amount} > 0`),
    check('subscription_payment_four_eyes', sql`${table.confirmedBy} <> ${table.preparedBy}`),
  ],
);

/**
 * Correction of the ledger (SPEC §10.3, §4.8): proposed by an Issuer Administrator, approved by a
 * Compliance Officer or another Issuer Administrator. Approval writes a counter-entry (CORRECTION)
 * that reverses the target, then the replacement movements if any; the original entry never
 * changes.
 */
export const correctionRequest = registrySchema.table(
  'correction_request',
  {
    id: id(),
    tenantId: tenantId().references(() => tenant.id),
    issuanceId: uuid()
      .notNull()
      .references(() => issuance.id),
    targetEntryId: uuid()
      .notNull()
      .references(() => ledgerEntry.id),
    /** Replacement movements: `{ sourceAccountId, destinationAccountId, quantity }[]`. */
    proposedEntries: jsonb()
      .$type<
        { sourceAccountId: string | null; destinationAccountId: string | null; quantity: string }[]
      >()
      .notNull()
      .default([]),
    reason: text().notNull(),
    status: text().notNull().default('PROPOSED'),
    requestedBy: uuid().notNull(),
    decidedBy: uuid(),
    decidedAt: utcTimestamp(),
    decisionComment: text(),
    ...auditColumns(),
  },
  (table) => [
    check(
      'correction_request_status',
      sql`${table.status} IN ('PROPOSED', 'APPROVED', 'REJECTED')`,
    ),
    check('correction_request_four_eyes', sql`${table.decidedBy} <> ${table.requestedBy}`),
    index('correction_request_issuance').on(table.tenantId, table.issuanceId, table.status),
  ],
);

/**
 * A transfer of units between two investors of an issuance (SPEC §11): requested by the holder
 * with the recipient's code (D-010), reviewed by a Compliance Officer or an Issuer Administrator.
 * A transfer without financial settlement: the indicative price is information only (§11.3).
 */
export const transferRequest = registrySchema.table(
  'transfer_request',
  {
    id: id(),
    tenantId: tenantId().references(() => tenant.id),
    issuanceId: uuid()
      .notNull()
      .references(() => issuance.id),
    fromInvestorId: uuid()
      .notNull()
      .references(() => investor.id),
    toInvestorId: uuid()
      .notNull()
      .references(() => investor.id),
    /** The code the sender typed; the recipient's identity is never shown to the sender. */
    recipientCode: text().notNull(),
    quantity: units().notNull(),
    indicativePrice: numeric({ precision: 24, scale: 4 }),
    indicativePriceCurrency: char({ length: 3 }),
    status: text().notNull().default('DRAFT'),
    blockEntryId: uuid().references(() => ledgerEntry.id),
    transferEntryId: uuid().references(() => ledgerEntry.id),
    eligibilityAssessmentId: uuid(),
    requestedBy: uuid().notNull(),
    submittedAt: utcTimestamp(),
    reviewedBy: uuid(),
    reviewedAt: utcTimestamp(),
    rejectionReason: text(),
    cancellationReason: text(),
    ...auditColumns(),
  },
  (table) => [
    check(
      'transfer_request_status',
      sql`${table.status} IN ('DRAFT', 'SUBMITTED', 'COMPLIANCE_REVIEW', 'APPROVED', 'REJECTED', 'EXECUTED', 'CANCELLED')`,
    ),
    check('transfer_request_quantity_positive', sql`${table.quantity} > 0`),
    check('transfer_request_not_to_self', sql`${table.fromInvestorId} <> ${table.toInvestorId}`),
    index('transfer_request_issuance_status').on(table.tenantId, table.issuanceId, table.status),
    index('transfer_request_from').on(table.tenantId, table.fromInvestorId),
  ],
);
