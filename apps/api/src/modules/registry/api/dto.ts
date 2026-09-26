import { CURRENCY_MINOR_UNITS, isCurrencyCode, parseDecimal } from '@virtus/shared';
import { z } from 'zod';
import { paginationQuery } from '../../../core/http/pagination.js';
import type { SubscriptionWithNames } from '../application/subscriptions.service.js';
import { SUBSCRIPTION_STATUSES, type SubscriptionStatus } from '../domain/subscription-machine.js';

/** Amounts travel as decimal strings (SPEC §21.2); units are whole numbers, as strings too. */
const amount = z.string().regex(/^\d{1,20}(\.\d{1,4})?$/, 'A positive decimal, e.g. 150000.00');
const units = z.string().regex(/^\d{1,20}(\.\d{1,4})?$/, 'Whole units, e.g. 150');

export const subscriptionCreateBody = z.strictObject({
  issuanceId: z.uuid(),
  requestedUnits: units,
  requestedAmount: amount,
  paymentReference: z.string().trim().max(100).nullable().optional(),
  comment: z.string().trim().max(2000).nullable().optional(),
});

export const subscriptionUpdateBody = subscriptionCreateBody.omit({ issuanceId: true }).partial();

export const submitBody = z.strictObject({
  documentsAccepted: z.boolean(),
  eligibilityDeclared: z.boolean(),
});

export const reasonBody = z.strictObject({ reason: z.string().trim().min(1).max(2000) });
export const cancelBody = z.strictObject({
  reason: z.string().trim().max(2000).nullable().optional(),
});

export const listQuery = paginationQuery.extend({
  issuanceId: z.uuid().optional(),
  investorId: z.uuid().optional(),
  status: z.enum(SUBSCRIPTION_STATUSES).optional(),
});

export const subscriptionView = z.object({
  id: z.uuid(),
  issuanceId: z.uuid(),
  issuanceName: z.string(),
  issuanceCode: z.string(),
  investorId: z.uuid(),
  investorName: z.string(),
  status: z.enum(SUBSCRIPTION_STATUSES),
  requestedUnits: z.string(),
  requestedAmount: z.string(),
  currency: z.string(),
  allocatedUnits: z.string().nullable(),
  amountDue: z.string().nullable(),
  paymentReference: z.string().nullable(),
  comment: z.string().nullable(),
  submittedAt: z.iso.datetime().nullable(),
  eligibilityAssessmentId: z.uuid().nullable(),
  decidedAt: z.iso.datetime().nullable(),
  rejectionReason: z.string().nullable(),
  cancellationReason: z.string().nullable(),
  version: z.int(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const transitionView = z.object({
  fromStatus: z.enum(SUBSCRIPTION_STATUSES).nullable(),
  toStatus: z.enum(SUBSCRIPTION_STATUSES),
  actorName: z.string().nullable(),
  actorUserId: z.uuid().nullable(),
  comment: z.string().nullable(),
  occurredAt: z.iso.datetime(),
});

export function toSubscriptionView(row: SubscriptionWithNames): z.infer<typeof subscriptionView> {
  const places = isCurrencyCode(row.currency) ? CURRENCY_MINOR_UNITS[row.currency] : 2;
  const money = (value: string | null) =>
    value === null ? null : parseDecimal(value).toFixed(places);
  const whole = (value: string | null) => (value === null ? null : parseDecimal(value).toString());
  return {
    id: row.id,
    issuanceId: row.issuanceId,
    issuanceName: row.issuanceName,
    issuanceCode: row.issuanceCode,
    investorId: row.investorId,
    investorName: row.investorName,
    status: row.status as SubscriptionStatus,
    requestedUnits: whole(row.requestedUnits)!,
    requestedAmount: money(row.requestedAmount)!,
    currency: row.currency,
    allocatedUnits: whole(row.allocatedUnits),
    amountDue: money(row.amountDue),
    paymentReference: row.paymentReference,
    comment: row.comment,
    submittedAt: row.submittedAt?.toISOString() ?? null,
    eligibilityAssessmentId: row.eligibilityAssessmentId,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    rejectionReason: row.rejectionReason,
    cancellationReason: row.cancellationReason,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
