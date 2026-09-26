import { CURRENCY_MINOR_UNITS, isCurrencyCode, parseDecimal } from '@virtus/shared';
import { z } from 'zod';
import { paginationQuery } from '../../../core/http/pagination.js';
import type { TransferWithNames } from '../application/transfers.service.js';
import { TRANSFER_STATUSES, type TransferStatus } from '../domain/transfer.js';

const wholeUnits = z.string().regex(/^\d{1,16}$/, 'Whole units, e.g. 40');
const price = z.string().regex(/^\d{1,20}(\.\d{1,4})?$/, 'A positive decimal, e.g. 1010.50');
/** Recipient code of D-048: VA-XXXX-XXXX (checked by lookup, whatever the case). */
const recipientCode = z.string().trim().min(4).max(20);

export const transferCreateBody = z.strictObject({
  issuanceId: z.uuid(),
  recipientCode,
  quantity: wholeUnits,
  indicativePrice: price.nullable().optional(),
});

export const transferUpdateBody = transferCreateBody.omit({ issuanceId: true }).partial();

export const transfersQuery = paginationQuery.extend({
  issuanceId: z.uuid().optional(),
  status: z.enum(TRANSFER_STATUSES).optional(),
});

export const transferView = z.object({
  id: z.uuid(),
  issuanceId: z.uuid(),
  issuanceName: z.string(),
  issuanceCode: z.string(),
  fromInvestorId: z.uuid(),
  fromInvestorName: z.string(),
  /** Null for the sender: the recipient's identity is never shown to it (D-010). */
  toInvestorId: z.uuid().nullable(),
  toInvestorName: z.string().nullable(),
  recipientCode: z.string(),
  quantity: z.string(),
  indicativePrice: z.string().nullable(),
  indicativePriceCurrency: z.string().nullable(),
  status: z.enum(TRANSFER_STATUSES),
  eligibilityAssessmentId: z.uuid().nullable(),
  submittedAt: z.iso.datetime().nullable(),
  reviewedAt: z.iso.datetime().nullable(),
  rejectionReason: z.string().nullable(),
  cancellationReason: z.string().nullable(),
  version: z.int(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export function toTransferView(row: TransferWithNames): z.infer<typeof transferView> {
  const currency = row.indicativePriceCurrency;
  return {
    id: row.id,
    issuanceId: row.issuanceId,
    issuanceName: row.issuanceName,
    issuanceCode: row.issuanceCode,
    fromInvestorId: row.fromInvestorId,
    fromInvestorName: row.fromInvestorName,
    toInvestorId: row.toInvestorName === null ? null : row.toInvestorId,
    toInvestorName: row.toInvestorName,
    recipientCode: row.recipientCode,
    quantity: parseDecimal(row.quantity).toString(),
    indicativePrice:
      row.indicativePrice === null
        ? null
        : parseDecimal(row.indicativePrice).toFixed(
            currency && isCurrencyCode(currency) ? CURRENCY_MINOR_UNITS[currency] : 2,
          ),
    indicativePriceCurrency: currency,
    status: row.status as TransferStatus,
    eligibilityAssessmentId: row.toInvestorName === null ? null : row.eligibilityAssessmentId,
    submittedAt: row.submittedAt?.toISOString() ?? null,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    rejectionReason: row.rejectionReason,
    cancellationReason: row.cancellationReason,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
