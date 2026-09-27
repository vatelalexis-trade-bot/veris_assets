import { Inject, Injectable } from '@nestjs/common';
import {
  addDays,
  CURRENCY_MINOR_UNITS,
  isCurrencyCode,
  parseDecimal,
  type Decimal,
} from '@virtus/shared';
import { and, asc, desc, eq, gt, inArray, isNull, lte, ne, or, sql } from 'drizzle-orm';
import { currentUser, type RequestUser } from '../../../core/context/request-context.js';
import {
  DATABASE,
  type Database,
  withCurrentTenant,
  withTenantTransaction,
} from '../../../core/database/database.js';
import { AppError } from '../../../core/errors/app-error.js';
import { TenantDirectory } from '../../iam/index.js';
import { RegistryQueries } from '../../registry/index.js';
import {
  investorDistribution,
  investorFigures,
  investorPosition,
  investorRequest,
  issuanceFigures,
  scheduledPayment,
  task,
  tenantActivity,
} from '../infrastructure/views.js';
import { AuditLogService } from './audit-log.service.js';

/** Amounts per currency: indicators never add euros and dollars together. */
export type Amounts = Record<string, string>;

/** Issuances that have terms worth counting (neither drafts nor cancelled ones). */
/** Longest "To do" queue returned at once (D-101). */
const TASKS_LIMIT = 200;

const LIVE = [
  'UNDER_REVIEW',
  'APPROVED',
  'SUBSCRIPTION_OPEN',
  'SUBSCRIPTION_CLOSED',
  'ALLOCATED',
  'ACTIVE',
  'MATURED',
];

function money(value: Decimal, currency: string): string {
  return value.toFixed(isCurrencyCode(currency) ? CURRENCY_MINOR_UNITS[currency] : 2);
}

/** Sums of `(currency, amount)` pairs, formatted with the currency's minor units. */
function byCurrency(values: readonly (readonly [string | null, Decimal])[]): Amounts {
  const totals = new Map<string, Decimal>();
  for (const [currency, amount] of values) {
    if (!currency) continue;
    totals.set(currency, (totals.get(currency) ?? parseDecimal('0')).plus(amount));
  }
  return Object.fromEntries(
    [...totals].map(([currency, total]) => [currency, money(total, currency)]),
  );
}

const dec = (value: string | null) => parseDecimal(value ?? '0');

/**
 * Dashboards, "To do" queue and indicators (SPEC §13.1, §13.5, §14.1, §14.3, §18). Read-only,
 * through the reporting views: the row level security of the underlying tables applies.
 */
@Injectable()
export class ReportingService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly tenants: TenantDirectory,
    private readonly registry: RegistryQueries,
    private readonly audit: AuditLogService,
  ) {}

  /** The issuer's dashboard (SPEC §13.1) and indicators (SPEC §18). */
  async issuerDashboard() {
    const recent = await this.audit.list({}, { page: 1, pageSize: 8 });
    return withCurrentTenant(this.db, async (tx, tenantId) => {
      const today = await this.tenants.todayOf(tx, tenantId);
      const issuances = await tx.select().from(issuanceFigures).orderBy(asc(issuanceFigures.code));
      const [investors] = await tx.select().from(investorFigures);
      const tasks = await tx
        .select({ kind: task.kind, total: sql<number>`count(*)::int` })
        .from(task)
        .groupBy(task.kind);
      const upcoming = await tx
        .select()
        .from(scheduledPayment)
        .where(lte(scheduledPayment.paymentDate, addDays(today, 90)))
        .orderBy(asc(scheduledPayment.paymentDate))
        .limit(10);
      const holders = await tx
        .selectDistinct({ investorId: investorPosition.investorId })
        .from(investorPosition)
        .where(gt(investorPosition.quantityHeld, '0'));
      const live = issuances.filter((row) => LIVE.includes(row.status ?? ''));
      const waiting = (kinds: string[]) =>
        tasks.filter((row) => kinds.includes(row.kind)).reduce((sum, row) => sum + row.total, 0);
      const subscribed = live.reduce(
        (sum, row) => sum.plus(row.subscribedAmount),
        parseDecimal('0'),
      );
      const target = live.reduce((sum, row) => sum.plus(dec(row.targetAmount)), parseDecimal('0'));
      const subscriptions = live.reduce((sum, row) => sum + row.subscriptionCount, 0);
      const investorCount = investors?.investorCount ?? 0;
      return {
        issuances: live.length,
        activeIssuances: issuances.filter((row) => row.status === 'ACTIVE').length,
        administered: byCurrency(
          issuances.map((row) => [
            row.currency,
            dec(row.heldByInvestors).times(dec(row.nominalValue)),
          ]),
        ),
        target: byCurrency(live.map((row) => [row.currency, dec(row.targetAmount)])),
        subscribed: byCurrency(
          live.map((row) => [row.currency, parseDecimal(row.subscribedAmount)]),
        ),
        /** Subscribed ÷ target over the live issuances, as a fraction ("0.85"), null without target. */
        subscriptionRate: target.isZero()
          ? null
          : subscribed.dividedBy(target).toDecimalPlaces(4).toString(),
        allocated: byCurrency(
          issuances.map((row) => [
            row.currency,
            dec(row.allocatedUnits).times(dec(row.nominalValue)),
          ]),
        ),
        distributed: byCurrency(issuances.map((row) => [row.currency, dec(row.distributedAmount)])),
        averageTicket: byCurrency(
          subscriptions === 0
            ? []
            : live.map((row) => [
                row.currency,
                parseDecimal(row.subscribedAmount).dividedBy(subscriptions),
              ]),
        ),
        investors: investorCount,
        holders: holders.length,
        eligibleInvestors: investors?.eligibleCount ?? 0,
        /** KYC/KYB approved ÷ investors, as a fraction. */
        investorValidationRate:
          investorCount === 0
            ? null
            : parseDecimal(String(investors!.kycApprovedCount))
                .dividedBy(investorCount)
                .toDecimalPlaces(4)
                .toString(),
        kycExpiring: investors?.kycExpiringCount ?? 0,
        pendingSubscriptions: waiting(['SUBSCRIPTION_TO_REVIEW', 'SUBSCRIPTION_TO_DECIDE']),
        pendingPayments: waiting([
          'SUBSCRIPTION_PAYMENT_TO_CONFIRM',
          'DISTRIBUTION_PAYMENT_TO_CONFIRM',
        ]),
        pendingTransfers: waiting(['TRANSFER_TO_REVIEW']),
        pendingOperations: tasks.reduce((sum, row) => sum + row.total, 0),
        upcomingPayments: upcoming.map((row) => ({
          ...row,
          overdue: row.paymentDate < today,
        })),
        issuanceRows: live.map((row) => ({
          issuanceId: row.issuanceId!,
          code: row.code!,
          name: row.name!,
          status: row.status!,
          currency: row.currency,
          target:
            row.targetAmount === null ? null : money(dec(row.targetAmount), row.currency ?? 'EUR'),
          subscribed: money(parseDecimal(row.subscribedAmount), row.currency ?? 'EUR'),
          progress: dec(row.targetAmount).isZero()
            ? null
            : parseDecimal(row.subscribedAmount)
                .dividedBy(dec(row.targetAmount))
                .toDecimalPlaces(4)
                .toString(),
          holders: row.holders,
          maturityDate: row.maturityDate,
          subscriptionEndDate: row.subscriptionEndDate,
        })),
        recentActivity: recent.data,
      };
    });
  }

  /**
   * The "To do" queue (SPEC §13.5): what waits for a decision the user may take, never on an
   * operation it initiated itself (four eyes), the most urgent first.
   */
  tasks() {
    const user = currentUser();
    const allowed = [...user.permissions]
      .filter(([, scope]) => scope === 'all')
      .map(([code]) => code);
    return withCurrentTenant(this.db, async (tx) => {
      if (allowed.length === 0) return [];
      return (
        tx
          .select()
          .from(task)
          .where(
            and(
              inArray(task.permission, allowed),
              or(isNull(task.initiatedBy), ne(task.initiatedBy, user.userId)),
            ),
          )
          .orderBy(sql`${task.dueDate} ASC NULLS LAST`, asc(task.waitingSince))
          // The most urgent ones: a queue longer than this is handled screen by screen (D-101).
          .limit(TASKS_LIMIT)
      );
    });
  }

  /** Platform indicators (SPEC §18), added up tenant by tenant. */
  async platformMetrics() {
    const tenants = await this.tenants.activeTenants();
    const rows = await Promise.all(
      tenants.map(({ id }) =>
        withTenantTransaction(
          this.db,
          id,
          async (tx) => (await tx.select().from(tenantActivity))[0],
        ),
      ),
    );
    const present = rows.filter((row): row is NonNullable<typeof row> => row !== undefined);
    const sum = (pick: (row: (typeof present)[number]) => number) =>
      present.reduce((total, row) => total + pick(row), 0);
    const hours = present.filter((row) => row.averageDecisionHours !== null);
    return {
      organisations: tenants.length,
      activeUsers: sum((row) => row.activeUsers),
      issuances: sum((row) => row.issuances),
      activeIssuances: sum((row) => row.activeIssuances),
      investors: sum((row) => row.investors),
      /** Nominal value held by investors, all currencies of the MVP being euros (SPEC §18). */
      nominalAdministered: money(
        present.reduce((total, row) => total.plus(row.nominalAdministered), parseDecimal('0')),
        'EUR',
      ),
      ledgerOperations: sum((row) => row.ledgerOperations),
      failures30Days: sum((row) => row.failures30Days),
      averageDecisionHours:
        hours.length === 0
          ? null
          : hours
              .reduce((total, row) => total.plus(row.averageDecisionHours!), parseDecimal('0'))
              .dividedBy(hours.length)
              .toDecimalPlaces(1)
              .toString(),
    };
  }

  /** The investor's dashboard (SPEC §14.1), from its own data only. */
  investorOverview() {
    const investorId = this.ownInvestor(currentUser());
    return withCurrentTenant(this.db, async (tx) => {
      const positions = await tx
        .select()
        .from(investorPosition)
        .where(
          and(eq(investorPosition.investorId, investorId), gt(investorPosition.quantityHeld, '0')),
        )
        .orderBy(asc(investorPosition.code));
      const received = await tx
        .select()
        .from(investorDistribution)
        .where(eq(investorDistribution.investorId, investorId));
      const requests = await tx
        .select()
        .from(investorRequest)
        .where(eq(investorRequest.investorId, investorId))
        .orderBy(desc(investorRequest.updatedAt))
        .limit(10);
      const next = positions
        .filter((row) => row.nextPaymentDate !== null)
        .sort((a, b) => (a.nextPaymentDate! < b.nextPaymentDate! ? -1 : 1))[0];
      return {
        nominalHeld: byCurrency(
          positions.map((row) => [
            row.currency,
            dec(row.quantityHeld).times(dec(row.nominalValue)),
          ]),
        ),
        positions: positions.length,
        distributionsReceived: byCurrency(
          received.map((row) => [row.currency, parseDecimal(row.grossAmount)]),
        ),
        nextPayment: next
          ? { date: next.nextPaymentDate!, code: next.code, positionId: next.positionId }
          : null,
        pendingRequests: requests,
        positionRows: positions.map((row) => this.positionView(row)),
      };
    });
  }

  /** One of the investor's positions (SPEC §14.3): terms, movements and distributions received. */
  async investorPosition(positionId: string) {
    const investorId = this.ownInvestor(currentUser());
    const found = await withCurrentTenant(this.db, async (tx) => {
      const [row] = await tx
        .select()
        .from(investorPosition)
        .where(
          and(
            eq(investorPosition.positionId, positionId),
            eq(investorPosition.investorId, investorId),
          ),
        );
      if (!row) throw new AppError('RESOURCE_NOT_FOUND');
      const received = await tx
        .select()
        .from(investorDistribution)
        .where(
          and(
            eq(investorDistribution.investorId, investorId),
            eq(investorDistribution.issuanceId, row.issuanceId),
          ),
        )
        .orderBy(desc(investorDistribution.paymentDate));
      return { row, received };
    });
    const movements = await this.registry.entries(
      { issuanceId: found.row.issuanceId },
      { page: 1, pageSize: 100 },
    );
    return {
      position: this.positionView(found.row),
      movements: movements.data,
      distributions: found.received.map((row) => ({
        distributionId: row.distributionId,
        type: row.type,
        paymentDate: row.paymentDate,
        grossAmount: money(parseDecimal(row.grossAmount), row.currency),
        currency: row.currency,
      })),
    };
  }

  private positionView(row: typeof investorPosition.$inferSelect) {
    const currency = row.currency ?? 'EUR';
    return {
      positionId: row.positionId,
      issuanceId: row.issuanceId,
      code: row.code,
      name: row.name,
      status: row.status,
      legalIssuerName: row.legalIssuerName,
      currency,
      nominalValue: row.nominalValue === null ? null : money(dec(row.nominalValue), currency),
      interestRate: row.interestRate === null ? null : dec(row.interestRate).toString(),
      maturityDate: row.maturityDate,
      distributionFrequency: row.distributionFrequency,
      quantityHeld: dec(row.quantityHeld).toString(),
      quantityBlocked: dec(row.quantityBlocked).toString(),
      quantityAvailable: dec(row.quantityAvailable).toString(),
      acquisitionAmount: money(dec(row.acquisitionAmount), currency),
      nominalAmount: money(dec(row.quantityHeld).times(dec(row.nominalValue)), currency),
      nextPaymentDate: row.nextPaymentDate,
    };
  }

  /** The investor's own profile; staff have no investor dashboard. */
  private ownInvestor(user: RequestUser): string {
    if (!user.investorId) throw new AppError('RESOURCE_NOT_FOUND');
    return user.investorId;
  }
}
