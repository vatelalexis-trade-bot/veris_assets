import { CURRENCY_MINOR_UNITS, isCurrencyCode, parseDecimal } from '@virtus/shared';
import { z } from 'zod';
import { paginationQuery } from '../../../core/http/pagination.js';
import type {
  DistributionDetail,
  LineRow,
  RecalculationCheck,
} from '../application/distributions.service.js';
import type { ScheduleRow } from '../application/schedules.service.js';
import { DISTRIBUTION_STATUSES, type DistributionStatus } from '../domain/distribution.js';

export const distributionCreateBody = z.strictObject({ couponScheduleId: z.uuid() });
export const commentBody = z.strictObject({ comment: z.string().trim().min(1).max(2000) });
export const distributionsQuery = paginationQuery.extend({
  issuanceId: z.uuid().optional(),
  status: z.enum(DISTRIBUTION_STATUSES).optional(),
});

export const scheduleView = z.object({
  id: z.uuid(),
  sequence: z.int(),
  type: z.enum(['COUPON', 'PRINCIPAL']),
  periodStart: z.iso.date(),
  periodEnd: z.iso.date(),
  paymentDate: z.iso.date(),
  recordDate: z.iso.date(),
  status: z.enum(['SCHEDULED', 'DISTRIBUTED', 'CANCELLED']),
  distributionId: z.uuid().nullable(),
  distributionStatus: z.enum(DISTRIBUTION_STATUSES).nullable(),
});

export const instructionView = z.object({
  id: z.uuid(),
  status: z.enum(['GENERATED', 'PREPARED', 'CONFIRMED', 'FAILED']),
  totalAmount: z.string(),
  currency: z.string(),
  lineCount: z.int(),
  generatedAt: z.iso.datetime(),
  preparedBy: z.uuid().nullable(),
  preparedAt: z.iso.datetime().nullable(),
  confirmedBy: z.uuid().nullable(),
  confirmedAt: z.iso.datetime().nullable(),
  providerReference: z.string().nullable(),
});

export const distributionView = z.object({
  id: z.uuid(),
  issuanceId: z.uuid(),
  issuanceName: z.string(),
  issuanceCode: z.string(),
  type: z.enum(['COUPON', 'PRINCIPAL']),
  status: z.enum(DISTRIBUTION_STATUSES),
  schedule: scheduleView.pick({
    id: true,
    sequence: true,
    periodStart: true,
    periodEnd: true,
    paymentDate: true,
    recordDate: true,
  }),
  dayCount: z.string().nullable(),
  /** Exact decimal, e.g. "0.5". */
  periodFraction: z.string().nullable(),
  rate: z.string().nullable(),
  nominalValue: z.string().nullable(),
  currency: z.string(),
  roundingMethod: z.string().nullable(),
  totalGrossAmount: z.string().nullable(),
  totalUnroundedAmount: z.string().nullable(),
  roundingDifference: z.string().nullable(),
  beneficiaryCount: z.int().nullable(),
  calculationVersion: z.string().nullable(),
  calculatedAt: z.iso.datetime().nullable(),
  snapshotId: z.uuid().nullable(),
  preparedBy: z.uuid().nullable(),
  approvedBy: z.uuid().nullable(),
  approvedAt: z.iso.datetime().nullable(),
  statusComment: z.string().nullable(),
  instruction: instructionView.nullable(),
  version: z.int(),
});

export const lineView = z.object({
  investorId: z.uuid(),
  investorName: z.string().nullable(),
  eligibleQuantity: z.string(),
  grossAmountUnrounded: z.string(),
  grossAmount: z.string(),
  currency: z.string(),
  anomalyCode: z.string().nullable(),
});

export const recalculationView = z.object({
  snapshotReproducible: z.boolean(),
  identical: z.boolean(),
  totalGrossAmount: z.string().nullable(),
  differences: z.array(
    z.object({
      accountId: z.uuid(),
      stored: z.string().nullable(),
      recalculated: z.string().nullable(),
    }),
  ),
});

const decimal = (value: string | null) => (value === null ? null : parseDecimal(value).toString());
function money(value: string | null, currency: string): string | null {
  return value === null
    ? null
    : parseDecimal(value).toFixed(isCurrencyCode(currency) ? CURRENCY_MINOR_UNITS[currency] : 2);
}

export function toScheduleView(row: ScheduleRow): z.infer<typeof scheduleView> {
  return {
    id: row.id,
    sequence: row.sequence,
    type: row.type as 'COUPON' | 'PRINCIPAL',
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    paymentDate: row.paymentDate,
    recordDate: row.recordDate,
    status: row.status as z.infer<typeof scheduleView>['status'],
    distributionId: row.distributionId,
    distributionStatus: row.distributionStatus as DistributionStatus | null,
  };
}

export function toDistributionView(detail: DistributionDetail): z.infer<typeof distributionView> {
  const row = detail.distribution;
  const instruction = detail.instruction;
  return {
    id: row.id,
    issuanceId: row.issuanceId,
    issuanceName: detail.issuanceName,
    issuanceCode: detail.issuanceCode,
    type: row.type as 'COUPON' | 'PRINCIPAL',
    status: row.status as DistributionStatus,
    schedule: {
      id: detail.schedule.id,
      sequence: detail.schedule.sequence,
      periodStart: detail.schedule.periodStart,
      periodEnd: detail.schedule.periodEnd,
      paymentDate: detail.schedule.paymentDate,
      recordDate: detail.schedule.recordDate,
    },
    dayCount: row.dayCount,
    periodFraction: decimal(row.periodFraction),
    rate: decimal(row.rate),
    nominalValue: money(row.nominalValue, row.currency),
    currency: row.currency,
    roundingMethod: row.roundingMethod,
    totalGrossAmount: money(row.totalGrossAmount, row.currency),
    totalUnroundedAmount: decimal(row.totalUnroundedAmount),
    roundingDifference: decimal(row.roundingDifference),
    beneficiaryCount: row.beneficiaryCount,
    calculationVersion: row.calculationVersion,
    calculatedAt: row.calculatedAt?.toISOString() ?? null,
    snapshotId: row.snapshotId,
    preparedBy: row.preparedBy,
    approvedBy: row.approvedBy,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    statusComment: row.statusComment,
    instruction: instruction
      ? {
          id: instruction.id,
          status: instruction.status as z.infer<typeof instructionView>['status'],
          totalAmount: money(instruction.totalAmount, instruction.currency)!,
          currency: instruction.currency,
          lineCount: instruction.lineCount,
          generatedAt: instruction.generatedAt.toISOString(),
          preparedBy: instruction.preparedBy,
          preparedAt: instruction.preparedAt?.toISOString() ?? null,
          confirmedBy: instruction.confirmedBy,
          confirmedAt: instruction.confirmedAt?.toISOString() ?? null,
          providerReference: instruction.providerReference,
        }
      : null,
    version: row.version,
  };
}

export function toLineView(row: LineRow): z.infer<typeof lineView> {
  return {
    investorId: row.investorId,
    investorName: row.investorName,
    eligibleQuantity: parseDecimal(row.eligibleQuantity).toString(),
    grossAmountUnrounded: parseDecimal(row.grossAmountUnrounded).toString(),
    grossAmount: money(row.grossAmount, row.currency)!,
    currency: row.currency,
    anomalyCode: row.anomalyCode,
  };
}

export function toRecalculationView(check: RecalculationCheck): z.infer<typeof recalculationView> {
  return check;
}
