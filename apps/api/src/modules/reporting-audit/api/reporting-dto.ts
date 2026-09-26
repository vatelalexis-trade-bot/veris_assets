import { z } from 'zod';
import { EXPORT_KINDS, EXPORT_STATUSES } from '@virtus/shared';
import { ledgerEntryView } from '../../registry/index.js';

/** Amounts per currency, e.g. `{ "EUR": "1250000.00" }`. */
const amounts = z.record(z.string(), z.string());
const fraction = z.string().nullable();

export const issuerDashboardView = z.object({
  issuances: z.int(),
  activeIssuances: z.int(),
  administered: amounts,
  target: amounts,
  subscribed: amounts,
  subscriptionRate: fraction,
  allocated: amounts,
  distributed: amounts,
  averageTicket: amounts,
  investors: z.int(),
  holders: z.int(),
  eligibleInvestors: z.int(),
  investorValidationRate: fraction,
  kycExpiring: z.int(),
  pendingSubscriptions: z.int(),
  pendingPayments: z.int(),
  pendingTransfers: z.int(),
  pendingOperations: z.int(),
  upcomingPayments: z.array(
    z.object({
      scheduleId: z.uuid(),
      issuanceId: z.uuid(),
      code: z.string(),
      name: z.string(),
      sequence: z.int(),
      type: z.enum(['COUPON', 'PRINCIPAL']),
      recordDate: z.iso.date(),
      paymentDate: z.iso.date(),
      distributionId: z.uuid().nullable(),
      distributionStatus: z.string().nullable(),
      overdue: z.boolean(),
    }),
  ),
  issuanceRows: z.array(
    z.object({
      issuanceId: z.uuid(),
      code: z.string(),
      name: z.string(),
      status: z.string(),
      currency: z.string().nullable(),
      target: z.string().nullable(),
      subscribed: z.string(),
      progress: fraction,
      holders: z.int(),
      maturityDate: z.iso.date().nullable(),
      subscriptionEndDate: z.iso.date().nullable(),
    }),
  ),
  recentActivity: z.array(
    z.object({
      id: z.uuid(),
      action: z.string(),
      actorName: z.string().nullable(),
      resourceType: z.string().nullable(),
      occurredAt: z.iso.datetime(),
      result: z.string(),
    }),
  ),
});

export const taskView = z.object({
  kind: z.string(),
  resourceType: z.string(),
  resourceId: z.uuid(),
  reference: z.string().nullable(),
  waitingSince: z.iso.datetime().nullable(),
  dueDate: z.iso.date().nullable(),
});

export const platformMetricsView = z.object({
  organisations: z.int(),
  activeUsers: z.int(),
  issuances: z.int(),
  activeIssuances: z.int(),
  investors: z.int(),
  nominalAdministered: z.string(),
  ledgerOperations: z.int(),
  failures30Days: z.int(),
  averageDecisionHours: z.string().nullable(),
});

export const positionSummaryView = z.object({
  positionId: z.uuid(),
  issuanceId: z.uuid(),
  code: z.string(),
  name: z.string(),
  status: z.string(),
  legalIssuerName: z.string().nullable(),
  currency: z.string(),
  nominalValue: z.string().nullable(),
  interestRate: z.string().nullable(),
  maturityDate: z.iso.date().nullable(),
  distributionFrequency: z.string().nullable(),
  quantityHeld: z.string(),
  quantityBlocked: z.string(),
  quantityAvailable: z.string(),
  acquisitionAmount: z.string(),
  nominalAmount: z.string(),
  nextPaymentDate: z.iso.date().nullable(),
});

export const investorOverviewView = z.object({
  nominalHeld: amounts,
  positions: z.int(),
  distributionsReceived: amounts,
  nextPayment: z.object({ date: z.iso.date(), code: z.string(), positionId: z.uuid() }).nullable(),
  pendingRequests: z.array(
    z.object({
      kind: z.enum(['SUBSCRIPTION', 'TRANSFER']),
      resourceId: z.uuid(),
      reference: z.string(),
      status: z.string(),
      updatedAt: z.iso.datetime(),
    }),
  ),
  positionRows: z.array(positionSummaryView),
});

export const investorPositionView = z.object({
  position: positionSummaryView,
  movements: z.array(ledgerEntryView),
  distributions: z.array(
    z.object({
      distributionId: z.uuid(),
      type: z.enum(['COUPON', 'PRINCIPAL']),
      paymentDate: z.iso.date(),
      grossAmount: z.string(),
      currency: z.string(),
    }),
  ),
});

export const exportCreateBody = z.strictObject({
  kind: z.enum(EXPORT_KINDS),
  /** Limits the export to one issuance (not for AUDIT). */
  issuanceId: z.uuid().optional(),
});

export const exportView = z.object({
  id: z.uuid(),
  kind: z.enum(EXPORT_KINDS),
  issuanceId: z.uuid().nullable(),
  status: z.enum(EXPORT_STATUSES),
  documentId: z.uuid().nullable(),
  rowCount: z.int().nullable(),
  error: z.string().nullable(),
  createdAt: z.iso.datetime(),
  finishedAt: z.iso.datetime().nullable(),
});
