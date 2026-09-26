// Tables of the registry module (docs/DATA_MODEL.md §3.5). Phase 11: subscriptions. Amounts are
// NUMERIC in the issuance's currency; units are whole numbers.
import { sql } from 'drizzle-orm';
import { char, check, index, numeric, pgSchema, text, uuid } from 'drizzle-orm/pg-core';
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
