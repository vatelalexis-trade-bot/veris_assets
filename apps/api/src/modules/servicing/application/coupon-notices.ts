import { Injectable, type OnModuleInit } from '@nestjs/common';
import { parseDecimal } from '@veris/shared';
import { and, eq } from 'drizzle-orm';
import type { Transaction } from '../../../core/database/database.js';
import { DocumentsService } from '../../../core/documents/documents.service.js';
import {
  DEMO_FOOTER,
  formatDay,
  formatMoney,
  formatPercent,
  type DocumentLocale,
} from '../../../core/documents/format.js';
import { renderPdf } from '../../../core/documents/pdf.js';
import { OutboxRelay, type OutboxEventRecord } from '../../../core/outbox/outbox-relay.js';
import { UserDirectory } from '../../iam/index.js';
import { issuance } from '../../issuance/index.js';
import { RegistryQueries } from '../../registry/index.js';
import { couponSchedule, distribution, distributionLine } from '../infrastructure/schema.js';
import { DISTRIBUTION_EVENTS } from './distribution-events.js';

const TEXTS = {
  'en-GB': {
    COUPON: 'Coupon notice',
    PRINCIPAL: 'Principal repayment notice',
    holder: 'Holder',
    investor: 'Investor',
    issuer: 'Issuer',
    payment: 'Payment',
    paymentNo: 'Payment no.',
    period: 'Period',
    recordDate: 'Record date',
    paymentDate: 'Payment date',
    rate: 'Annual rate',
    dayCount: 'Day count',
    nominalValue: 'Nominal value per unit',
    eligibleUnits: 'Units held at the record date',
    grossAmount: 'Gross amount',
    amount: 'Amount',
    note: 'The gross amount is calculated from the internal registry at the record date. Taxes are not calculated by the platform. No real payment is made in this demonstration.',
  },
  'fr-FR': {
    COUPON: 'Avis de coupon',
    PRINCIPAL: 'Avis de remboursement du principal',
    holder: 'Porteur',
    investor: 'Investisseur',
    issuer: 'Émetteur',
    payment: 'Paiement',
    paymentNo: 'Échéance n°',
    period: 'Période',
    recordDate: 'Date d’enregistrement',
    paymentDate: 'Date de paiement',
    rate: 'Taux annuel',
    dayCount: 'Base de calcul',
    nominalValue: 'Valeur nominale par unité',
    eligibleUnits: 'Unités détenues à la date d’enregistrement',
    grossAmount: 'Montant brut',
    amount: 'Montant',
    note: 'Le montant brut est calculé à partir du registre interne à la date d’enregistrement. La plateforme ne calcule pas les impôts. Aucun paiement réel n’a lieu dans cette démonstration.',
  },
} as const;

/**
 * Notice of a paid distribution (SPEC §12.5, §16, P15-10): one PDF per holder of the current
 * calculation, in its language, kept in its documents. Generating twice gives one document.
 */
@Injectable()
export class CouponNotices implements OnModuleInit {
  constructor(
    private readonly relay: OutboxRelay,
    private readonly documents: DocumentsService,
    private readonly registry: RegistryQueries,
    private readonly users: UserDirectory,
  ) {}

  onModuleInit(): void {
    this.relay.on(DISTRIBUTION_EVENTS.paid, async (tx, event) => {
      await this.generate(tx, event);
      return [];
    });
  }

  private async generate(tx: Transaction, event: OutboxEventRecord): Promise<void> {
    const [found] = await tx
      .select({
        distribution,
        schedule: couponSchedule,
        issuanceName: issuance.name,
        issuanceCode: issuance.code,
        issuer: issuance.legalIssuerName,
      })
      .from(distribution)
      .innerJoin(couponSchedule, eq(couponSchedule.id, distribution.couponScheduleId))
      .innerJoin(issuance, eq(issuance.id, distribution.issuanceId))
      .where(eq(distribution.id, event.aggregateId));
    if (!found) return;
    const lines = await tx
      .select()
      .from(distributionLine)
      .where(
        and(
          eq(distributionLine.distributionId, found.distribution.id),
          eq(distributionLine.calculationNo, found.distribution.calculationNo),
        ),
      );
    const names = await this.registry.investorNames(
      tx,
      lines.map((line) => line.investorId),
    );
    for (const line of lines) {
      const locale = await this.users.localeOfInvestor(tx, line.investorId);
      const content = await this.render(found, line, names.get(line.investorId) ?? '—', locale);
      await this.documents.storeGenerated(tx, event.tenantId, {
        type: 'COUPON_NOTICE',
        name: `${found.distribution.type === 'PRINCIPAL' ? 'principal' : 'coupon'}-notice-${found.issuanceCode}-${found.schedule.sequence}-${line.accountId.slice(0, 8)}.pdf`,
        confidentiality: 'INVESTOR_VISIBLE',
        ownerType: 'INVESTOR',
        investorId: line.investorId,
        issuanceId: found.distribution.issuanceId,
        content,
        mimeType: 'application/pdf',
      });
    }
  }

  private render(
    found: {
      distribution: typeof distribution.$inferSelect;
      schedule: typeof couponSchedule.$inferSelect;
      issuanceName: string;
      issuanceCode: string;
      issuer: string | null;
    },
    line: typeof distributionLine.$inferSelect,
    investorName: string,
    locale: DocumentLocale,
  ): Promise<Buffer> {
    const t = TEXTS[locale];
    const { distribution: row, schedule } = found;
    const money = (value: string | null) =>
      value === null ? '—' : formatMoney(value, row.currency, locale);
    const payment: [string, string][] = [
      [t.paymentNo, String(schedule.sequence)],
      [
        t.period,
        `${formatDay(schedule.periodStart, locale)} – ${formatDay(schedule.periodEnd, locale)}`,
      ],
      [t.recordDate, formatDay(schedule.recordDate, locale)],
      [t.paymentDate, formatDay(schedule.paymentDate, locale)],
    ];
    if (row.type === 'COUPON') {
      payment.push(
        [
          t.rate,
          row.rate === null ? '—' : formatPercent(parseDecimal(row.rate).toString(), locale),
        ],
        [t.dayCount, row.dayCount ?? '—'],
      );
    }
    return renderPdf({
      title: t[row.type === 'PRINCIPAL' ? 'PRINCIPAL' : 'COUPON'],
      subtitle: `${found.issuanceName} (${found.issuanceCode})`,
      blocks: [
        {
          heading: t.holder,
          rows: [
            [t.investor, investorName],
            [t.issuer, found.issuer ?? '—'],
          ],
        },
        { heading: t.payment, rows: payment },
        {
          heading: t.amount,
          table: {
            columns: [t.nominalValue, t.eligibleUnits, t.grossAmount],
            rows: [
              [
                money(row.nominalValue),
                parseDecimal(line.eligibleQuantity).toString(),
                money(line.grossAmount),
              ],
            ],
          },
        },
        { paragraph: t.note },
      ],
      footer: DEMO_FOOTER[locale],
    });
  }
}
