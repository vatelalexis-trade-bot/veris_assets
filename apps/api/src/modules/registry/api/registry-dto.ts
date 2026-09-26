import { CURRENCY_MINOR_UNITS, isCurrencyCode, parseDecimal } from '@virtus/shared';
import { z } from 'zod';
import { paginationQuery } from '../../../core/http/pagination.js';
import type { AllocationRoundDetail } from '../application/allocations.service.js';
import type { LedgerEntryView, PositionRow } from '../application/registry-queries.js';
import { ALLOCATION_ROUND_STATUSES, type AllocationRoundStatus } from '../domain/allocation.js';
import { LEDGER_ENTRY_TYPES, type LedgerEntryType } from '../domain/ledger.js';

/** Whole units as strings ("400"); the MVP has no fraction of unit (SPEC §10.5). */
const wholeUnits = z.string().regex(/^\d{1,16}$/, 'Whole units, e.g. 400');

export const allocationRoundUpdateBody = z.strictObject({
  lines: z
    .array(z.strictObject({ subscriptionId: z.uuid(), allocatedUnits: wholeUnits }))
    .max(1000)
    .optional(),
  minimumWaiverJustification: z.string().trim().max(2000).nullable().optional(),
});

export const commentBody = z.strictObject({ comment: z.string().trim().min(1).max(2000) });

export const positionsQuery = paginationQuery.extend({
  issuanceId: z.uuid().optional(),
  investorId: z.uuid().optional(),
});

export const ledgerQuery = paginationQuery.extend({
  issuanceId: z.uuid().optional(),
  type: z.enum(LEDGER_ENTRY_TYPES).optional(),
});

const failureView = z.object({
  code: z.string(),
  subscriptionId: z.uuid().nullable(),
  meta: z.record(z.string(), z.string()).nullable(),
});

export const allocationRoundView = z.object({
  id: z.uuid(),
  issuanceId: z.uuid(),
  status: z.enum(ALLOCATION_ROUND_STATUSES),
  method: z.string(),
  minimumWaiverJustification: z.string().nullable(),
  proposedBy: z.uuid().nullable(),
  proposedByName: z.string().nullable(),
  proposedAt: z.iso.datetime().nullable(),
  validatedBy: z.uuid().nullable(),
  validatedByName: z.string().nullable(),
  validatedAt: z.iso.datetime().nullable(),
  rejectionComment: z.string().nullable(),
  version: z.int(),
  createdAt: z.iso.datetime(),
  issuance: z.object({
    id: z.uuid(),
    name: z.string(),
    code: z.string(),
    status: z.string(),
    currency: z.string(),
    nominalValue: z.string(),
    totalUnits: z.string(),
    minimumAmount: z.string().nullable(),
  }),
  lines: z.array(
    z.object({
      subscriptionId: z.uuid(),
      investorId: z.uuid(),
      investorName: z.string(),
      requestedUnits: z.string(),
      allocatedUnits: z.string(),
      amount: z.string(),
      subscriptionStatus: z.string(),
    }),
  ),
  totals: z.object({
    requestedUnits: z.string(),
    allocatedUnits: z.string(),
    allocatedAmount: z.string(),
  }),
  failures: z.array(failureView),
});

export const positionView = z.object({
  id: z.uuid(),
  issuanceId: z.uuid(),
  issuanceName: z.string(),
  issuanceCode: z.string(),
  accountId: z.uuid(),
  accountType: z.enum(['ISSUER_TREASURY', 'INVESTOR']),
  investorId: z.uuid().nullable(),
  investorName: z.string().nullable(),
  quantityHeld: z.string(),
  quantityBlocked: z.string(),
  quantityAvailable: z.string(),
  acquisitionAmount: z.string(),
  currency: z.string(),
  version: z.int(),
  updatedAt: z.iso.datetime(),
});

const accountSideView = z.object({
  accountId: z.uuid().nullable(),
  type: z.enum(['ISSUER_TREASURY', 'INVESTOR']).nullable(),
  investorId: z.uuid().nullable(),
  investorName: z.string().nullable(),
});

export const ledgerEntryView = z.object({
  id: z.uuid(),
  issuanceId: z.uuid(),
  issuanceCode: z.string(),
  sequenceNo: z.int(),
  type: z.enum(LEDGER_ENTRY_TYPES),
  source: accountSideView,
  destination: accountSideView,
  quantity: z.string(),
  effectiveDate: z.iso.date(),
  recordedAt: z.iso.datetime(),
  businessReference: z.string(),
  status: z.string(),
  reversesEntryId: z.uuid().nullable(),
  previousHash: z.string(),
  entryHash: z.string(),
  initiatedByUserId: z.uuid().nullable(),
  initiatedByService: z.string().nullable(),
  correlationId: z.string().nullable(),
});

const units = (value: string) => parseDecimal(value).toString();
function money(value: string, currency: string): string {
  return parseDecimal(value).toFixed(isCurrencyCode(currency) ? CURRENCY_MINOR_UNITS[currency] : 2);
}

export function toAllocationRoundView(
  detail: AllocationRoundDetail,
): z.infer<typeof allocationRoundView> {
  const { round, issuance } = detail;
  const currency = issuance.currency;
  return {
    id: round.id,
    issuanceId: round.issuanceId,
    status: round.status as AllocationRoundStatus,
    method: round.method,
    minimumWaiverJustification: round.minimumWaiverJustification,
    proposedBy: round.proposedBy,
    proposedByName: detail.proposedByName,
    proposedAt: round.proposedAt?.toISOString() ?? null,
    validatedBy: round.validatedBy,
    validatedByName: detail.validatedByName,
    validatedAt: round.validatedAt?.toISOString() ?? null,
    rejectionComment: round.rejectionComment,
    version: round.version,
    createdAt: round.createdAt.toISOString(),
    issuance: {
      ...issuance,
      nominalValue: money(issuance.nominalValue, currency),
      totalUnits: units(issuance.totalUnits),
      minimumAmount:
        issuance.minimumAmount === null ? null : money(issuance.minimumAmount, currency),
    },
    lines: detail.lines.map((line) => ({
      subscriptionId: line.subscriptionId,
      investorId: line.investorId,
      investorName: line.investorName,
      requestedUnits: line.requestedUnits,
      allocatedUnits: line.allocatedUnits,
      amount: money(line.amount, currency),
      subscriptionStatus: line.subscriptionStatus,
    })),
    totals: {
      requestedUnits: detail.totals.requestedUnits,
      allocatedUnits: detail.totals.allocatedUnits,
      allocatedAmount: money(detail.totals.allocatedAmount, currency),
    },
    failures: detail.failures.map((failure) => ({
      code: failure.code,
      subscriptionId: 'subscriptionId' in failure ? failure.subscriptionId : null,
      meta: 'meta' in failure ? failure.meta : null,
    })),
  };
}

export function toPositionView(row: PositionRow): z.infer<typeof positionView> {
  return {
    id: row.id,
    issuanceId: row.issuanceId,
    issuanceName: row.issuanceName,
    issuanceCode: row.issuanceCode,
    accountId: row.accountId,
    accountType: row.accountType as 'ISSUER_TREASURY' | 'INVESTOR',
    investorId: row.investorId,
    investorName: row.investorName,
    quantityHeld: units(row.quantityHeld),
    quantityBlocked: units(row.quantityBlocked),
    quantityAvailable: units(row.quantityAvailable),
    acquisitionAmount: money(row.acquisitionAmount, row.currency),
    currency: row.currency,
    version: row.version,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toLedgerEntryView(row: LedgerEntryView): z.infer<typeof ledgerEntryView> {
  const side = (value: LedgerEntryView['source']) => ({
    ...value,
    type: value.type as 'ISSUER_TREASURY' | 'INVESTOR' | null,
  });
  return {
    id: row.id,
    issuanceId: row.issuanceId,
    issuanceCode: row.issuanceCode,
    sequenceNo: row.sequenceNo,
    type: row.type as LedgerEntryType,
    source: side(row.source),
    destination: side(row.destination),
    quantity: units(row.quantity),
    effectiveDate: row.effectiveDate,
    recordedAt: row.recordedAt.toISOString(),
    businessReference: row.businessReference,
    status: row.status,
    reversesEntryId: row.reversesEntryId,
    previousHash: row.previousHash,
    entryHash: row.entryHash,
    initiatedByUserId: row.initiatedByUserId,
    initiatedByService: row.initiatedByService,
    correlationId: row.correlationId,
  };
}
