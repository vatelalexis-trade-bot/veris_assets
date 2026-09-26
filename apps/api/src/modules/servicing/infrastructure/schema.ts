// Tables of the servicing module (docs/DATA_MODEL.md §3.6): coupon schedules, distributions,
// their lines and the fictitious payment instructions. Amounts are NUMERIC in the issuance's
// currency; unrounded amounts keep 20 decimals (SPEC §12.2: at least 18).
import { sql } from 'drizzle-orm';
import {
  char,
  check,
  date,
  index,
  integer,
  numeric,
  pgSchema,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { auditColumns, id, tenantId, utcTimestamp } from '../../../core/database/columns.js';
import { tenant } from '../../iam/index.js';
import { issuance } from '../../issuance/index.js';

export const servicingSchema = pgSchema('servicing');

const money = () => numeric({ precision: 24, scale: 4 });
const exact = () => numeric({ precision: 40, scale: 20 });
const units = () => numeric({ precision: 20, scale: 4 });

/** Coupons and principal of an issuance, generated at its activation (SPEC §12.1). */
export const couponSchedule = servicingSchema.table(
  'coupon_schedule',
  {
    id: id(),
    tenantId: tenantId().references(() => tenant.id),
    issuanceId: uuid()
      .notNull()
      .references(() => issuance.id),
    sequence: integer().notNull(),
    type: text().notNull(),
    periodStart: date().notNull(),
    periodEnd: date().notNull(),
    paymentDate: date().notNull(),
    recordDate: date().notNull(),
    status: text().notNull().default('SCHEDULED'),
    distributionId: uuid(),
    createdAt: utcTimestamp().notNull().defaultNow(),
  },
  (table) => [
    check('coupon_schedule_type', sql`${table.type} IN ('COUPON', 'PRINCIPAL')`),
    check(
      'coupon_schedule_status',
      sql`${table.status} IN ('SCHEDULED', 'DISTRIBUTED', 'CANCELLED')`,
    ),
    unique('coupon_schedule_sequence').on(table.issuanceId, table.sequence),
  ],
);

/** A distribution of one scheduled payment (SPEC §12.2 to §12.5). */
export const distribution = servicingSchema.table(
  'distribution',
  {
    id: id(),
    tenantId: tenantId().references(() => tenant.id),
    issuanceId: uuid()
      .notNull()
      .references(() => issuance.id),
    couponScheduleId: uuid()
      .notNull()
      .references(() => couponSchedule.id),
    type: text().notNull(),
    status: text().notNull().default('DRAFT'),
    /** Registry snapshot at the record date (registry.registry_snapshot). */
    snapshotId: uuid(),
    /** Number of the current calculation: lines of earlier ones are kept. */
    calculationNo: integer().notNull().default(0),
    dayCount: text(),
    periodFraction: exact(),
    rate: numeric({ precision: 12, scale: 8 }),
    nominalValue: money(),
    currency: char({ length: 3 }).notNull(),
    roundingMethod: text(),
    totalGrossAmount: money(),
    totalUnroundedAmount: exact(),
    roundingDifference: exact(),
    beneficiaryCount: integer(),
    calculationVersion: text(),
    calculatedAt: utcTimestamp(),
    preparedBy: uuid(),
    approvedBy: uuid(),
    approvedAt: utcTimestamp(),
    statusComment: text(),
    ...auditColumns(),
  },
  (table) => [
    check(
      'distribution_status',
      sql`${table.status} IN ('DRAFT', 'CALCULATED', 'UNDER_REVIEW', 'APPROVED', 'PAYMENT_INSTRUCTION_GENERATED', 'PAID', 'FAILED', 'CANCELLED')`,
    ),
    check('distribution_type', sql`${table.type} IN ('COUPON', 'PRINCIPAL')`),
    check('distribution_four_eyes', sql`${table.approvedBy} <> ${table.preparedBy}`),
    // One distribution in progress or done per scheduled payment; cancelled ones are kept.
    uniqueIndex('distribution_one_per_schedule')
      .on(table.couponScheduleId)
      .where(sql`${table.status} <> 'CANCELLED'`),
    index('distribution_issuance').on(table.tenantId, table.issuanceId),
  ],
);

/** The gross amount of one holder in one calculation. */
export const distributionLine = servicingSchema.table(
  'distribution_line',
  {
    id: id(),
    tenantId: tenantId().references(() => tenant.id),
    distributionId: uuid()
      .notNull()
      .references(() => distribution.id),
    calculationNo: integer().notNull(),
    investorId: uuid().notNull(),
    accountId: uuid().notNull(),
    eligibleQuantity: units().notNull(),
    grossAmountUnrounded: exact().notNull(),
    grossAmount: money().notNull(),
    currency: char({ length: 3 }).notNull(),
    anomalyCode: text(),
  },
  (table) => [
    unique('distribution_line_account').on(
      table.distributionId,
      table.calculationNo,
      table.accountId,
    ),
    index('distribution_line_investor').on(table.tenantId, table.investorId),
  ],
);

/** Fictitious payment instruction of a distribution (SPEC §12.5): no real payment is made. */
export const paymentInstruction = servicingSchema.table(
  'payment_instruction',
  {
    id: id(),
    tenantId: tenantId().references(() => tenant.id),
    distributionId: uuid()
      .notNull()
      .unique()
      .references(() => distribution.id),
    status: text().notNull().default('GENERATED'),
    totalAmount: money().notNull(),
    currency: char({ length: 3 }).notNull(),
    lineCount: integer().notNull(),
    generatedAt: utcTimestamp().notNull(),
    preparedBy: uuid(),
    preparedAt: utcTimestamp(),
    confirmedBy: uuid(),
    confirmedAt: utcTimestamp(),
    providerReference: text(),
    ...auditColumns(),
  },
  (table) => [
    check(
      'payment_instruction_status',
      sql`${table.status} IN ('GENERATED', 'PREPARED', 'CONFIRMED', 'FAILED')`,
    ),
    check('payment_instruction_four_eyes', sql`${table.confirmedBy} <> ${table.preparedBy}`),
  ],
);
