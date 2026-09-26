// Reporting views (drizzle/0026_reporting_views.sql), read-only. Written by hand in SQL: this file
// only declares their columns for typed queries, and is not seen by drizzle-kit.
import { bigint, char, date, numeric, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

const reporting = pgSchema('reporting');
const decimal = () => numeric();
const count = () => bigint({ mode: 'number' });

export const issuanceFigures = reporting
  .view('issuance_figures', {
    tenantId: uuid(),
    issuanceId: uuid(),
    code: text(),
    name: text(),
    status: text(),
    currency: char({ length: 3 }),
    legalIssuerName: text(),
    nominalValue: decimal(),
    totalUnits: decimal(),
    targetAmount: decimal(),
    interestRate: decimal(),
    maturityDate: date(),
    subscriptionEndDate: date(),
    subscribedAmount: decimal().notNull(),
    subscriptionCount: count().notNull(),
    allocatedUnits: decimal().notNull(),
    heldByInvestors: decimal().notNull(),
    holders: count().notNull(),
    distributedAmount: decimal().notNull(),
    nextPaymentDate: date(),
  })
  .existing();

export const investorFigures = reporting
  .view('investor_figures', {
    tenantId: uuid(),
    investorCount: count().notNull(),
    eligibleCount: count().notNull(),
    kycApprovedCount: count().notNull(),
    kycExpiringCount: count().notNull(),
  })
  .existing();

export const task = reporting
  .view('task', {
    tenantId: uuid(),
    kind: text().notNull(),
    resourceType: text().notNull(),
    resourceId: uuid().notNull(),
    reference: text(),
    permission: text().notNull(),
    initiatedBy: uuid(),
    waitingSince: timestamp({ withTimezone: true, mode: 'date' }),
    dueDate: date(),
  })
  .existing();

export const investorPosition = reporting
  .view('investor_position', {
    tenantId: uuid(),
    positionId: uuid().notNull(),
    investorId: uuid().notNull(),
    issuanceId: uuid().notNull(),
    code: text().notNull(),
    name: text().notNull(),
    status: text().notNull(),
    legalIssuerName: text(),
    currency: char({ length: 3 }),
    nominalValue: decimal(),
    interestRate: decimal(),
    maturityDate: date(),
    distributionFrequency: text(),
    quantityHeld: decimal().notNull(),
    quantityBlocked: decimal().notNull(),
    quantityAvailable: decimal().notNull(),
    acquisitionAmount: decimal().notNull(),
    nextPaymentDate: date(),
  })
  .existing();

export const investorDistribution = reporting
  .view('investor_distribution', {
    tenantId: uuid(),
    investorId: uuid().notNull(),
    distributionId: uuid().notNull(),
    issuanceId: uuid().notNull(),
    type: text().notNull(),
    paymentDate: date().notNull(),
    grossAmount: decimal().notNull(),
    currency: char({ length: 3 }).notNull(),
  })
  .existing();

export const scheduledPayment = reporting
  .view('scheduled_payment', {
    tenantId: uuid(),
    scheduleId: uuid().notNull(),
    issuanceId: uuid().notNull(),
    code: text().notNull(),
    name: text().notNull(),
    sequence: bigint({ mode: 'number' }).notNull(),
    type: text().notNull(),
    recordDate: date().notNull(),
    paymentDate: date().notNull(),
    distributionId: uuid(),
    distributionStatus: text(),
  })
  .existing();

export const investorRequest = reporting
  .view('investor_request', {
    tenantId: uuid(),
    investorId: uuid().notNull(),
    kind: text().notNull(),
    resourceId: uuid().notNull(),
    reference: text().notNull(),
    status: text().notNull(),
    updatedAt: timestamp({ withTimezone: true, mode: 'date' }).notNull(),
  })
  .existing();

export const tenantActivity = reporting
  .view('tenant_activity', {
    tenantId: uuid(),
    activeUsers: count().notNull(),
    issuances: count().notNull(),
    activeIssuances: count().notNull(),
    investors: count().notNull(),
    nominalAdministered: decimal().notNull(),
    ledgerOperations: count().notNull(),
    failures30Days: bigint('failures_30_days', { mode: 'number' }).notNull(),
    averageDecisionHours: decimal(),
  })
  .existing();
