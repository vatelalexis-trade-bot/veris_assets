// Reporting views (drizzle/0026_reporting_views.sql), read-only. Written by hand in SQL: this file
// only declares their columns for typed queries, and is not seen by drizzle-kit.
import {
  bigint,
  char,
  date,
  integer,
  numeric,
  pgSchema,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

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
    sequence: integer().notNull(),
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

// Views of the CSV exports (drizzle/0029_exports_security.sql).
const instant = () => timestamp({ withTimezone: true, mode: 'date' });

export const registryExport = reporting
  .view('registry_export', {
    tenantId: uuid(),
    issuanceId: uuid().notNull(),
    issuanceCode: text().notNull(),
    accountType: text().notNull(),
    accountId: uuid().notNull(),
    investorId: uuid(),
    investorName: text(),
    quantityHeld: decimal().notNull(),
    quantityBlocked: decimal().notNull(),
    quantityAvailable: decimal().notNull(),
    nominalValue: decimal(),
    nominalAmount: decimal(),
    currency: char({ length: 3 }),
    updatedAt: instant(),
  })
  .existing();

export const subscriptionExport = reporting
  .view('subscription_export', {
    tenantId: uuid(),
    subscriptionId: uuid().notNull(),
    issuanceId: uuid().notNull(),
    issuanceCode: text().notNull(),
    investorId: uuid().notNull(),
    investorName: text().notNull(),
    status: text().notNull(),
    requestedUnits: decimal().notNull(),
    requestedAmount: decimal().notNull(),
    allocatedUnits: decimal(),
    amountDue: decimal(),
    currency: char({ length: 3 }),
    paymentReference: text(),
    submittedAt: instant(),
    decidedAt: instant(),
    rejectionReason: text(),
    cancellationReason: text(),
    createdAt: instant(),
  })
  .existing();

export const distributionLineExport = reporting
  .view('distribution_line_export', {
    tenantId: uuid(),
    distributionId: uuid().notNull(),
    issuanceId: uuid().notNull(),
    issuanceCode: text().notNull(),
    sequence: integer().notNull(),
    type: text().notNull(),
    status: text().notNull(),
    recordDate: date().notNull(),
    paymentDate: date().notNull(),
    investorId: uuid().notNull(),
    investorName: text(),
    accountId: uuid().notNull(),
    eligibleQuantity: decimal().notNull(),
    grossAmountUnrounded: decimal().notNull(),
    grossAmount: decimal().notNull(),
    currency: char({ length: 3 }),
  })
  .existing();

export const auditExport = reporting
  .view('audit_export', {
    tenantId: uuid(),
    auditEventId: uuid().notNull(),
    occurredAt: instant().notNull(),
    actorUserId: uuid(),
    actorName: text(),
    actorRole: text(),
    action: text().notNull(),
    resourceType: text(),
    resourceId: uuid(),
    result: text().notNull(),
    reason: text(),
    source: text(),
    correlationId: uuid(),
  })
  .existing();
