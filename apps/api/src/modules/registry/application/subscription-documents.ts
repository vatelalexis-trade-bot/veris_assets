import { Injectable, type OnModuleInit } from '@nestjs/common';
import { parseDecimal } from '@veris/shared';
import type { Transaction } from '../../../core/database/database.js';
import { DocumentsService } from '../../../core/documents/documents.service.js';
import {
  DEMO_FOOTER,
  formatInstant,
  formatMoney,
  type DocumentLocale,
} from '../../../core/documents/format.js';
import { renderPdf } from '../../../core/documents/pdf.js';
import { OutboxRelay, type OutboxEventRecord } from '../../../core/outbox/outbox-relay.js';
import { UserDirectory } from '../../iam/index.js';
import { IssuancesService } from '../../issuance/index.js';
import { SUBSCRIPTION_EVENTS } from './subscription-event-types.js';
import { SubscriptionsService, type SubscriptionWithNames } from './subscriptions.service.js';

const TEXTS = {
  'en-GB': {
    formTitle: 'Subscription form',
    confirmationTitle: 'Allocation confirmation',
    subscriber: 'Subscriber',
    investor: 'Investor',
    request: 'Request',
    issuer: 'Issuer',
    unitsRequested: 'Units requested',
    nominalValue: 'Nominal value per unit',
    amountRequested: 'Amount requested',
    paymentReference: 'Payment reference',
    submittedAt: 'Submitted on',
    documentsAccepted: 'Documents of the issuance accepted on',
    eligibilityDeclared: 'Eligibility declared on',
    allocation: 'Allocation',
    unitsAllocated: 'Units allocated',
    amountDue: 'Amount due',
    formNote:
      'This form records the subscription request submitted on the platform. It does not commit the issuer: the request is reviewed, then approved or rejected.',
    confirmationNote:
      'The units are recorded in the internal registry of the issuance and stay blocked until the payment of the amount due is confirmed. No real payment is made in this demonstration.',
  },
  'fr-FR': {
    formTitle: 'Bulletin de souscription',
    confirmationTitle: 'Confirmation d’allocation',
    subscriber: 'Souscripteur',
    investor: 'Investisseur',
    request: 'Demande',
    issuer: 'Émetteur',
    unitsRequested: 'Unités demandées',
    nominalValue: 'Valeur nominale par unité',
    amountRequested: 'Montant demandé',
    paymentReference: 'Référence de paiement',
    submittedAt: 'Envoyée le',
    documentsAccepted: 'Documents de l’émission acceptés le',
    eligibilityDeclared: 'Éligibilité déclarée le',
    allocation: 'Allocation',
    unitsAllocated: 'Unités allouées',
    amountDue: 'Montant dû',
    formNote:
      'Ce bulletin enregistre la demande de souscription envoyée sur la plateforme. Il n’engage pas l’émetteur : la demande est examinée, puis approuvée ou rejetée.',
    confirmationNote:
      'Les unités sont inscrites au registre interne de l’émission et restent bloquées jusqu’à la confirmation du paiement du montant dû. Aucun paiement réel n’a lieu dans cette démonstration.',
  },
} as const;

/**
 * Documents of a subscription (SPEC §16, P15-8, P15-9): the subscription form when it is
 * submitted, the allocation confirmation when units are allocated. Generated from the recorded
 * data in the investor's language, kept in its documents; generating twice gives one document.
 */
@Injectable()
export class SubscriptionDocuments implements OnModuleInit {
  constructor(
    private readonly relay: OutboxRelay,
    private readonly documents: DocumentsService,
    private readonly subscriptions: SubscriptionsService,
    private readonly issuances: IssuancesService,
    private readonly users: UserDirectory,
  ) {}

  onModuleInit(): void {
    this.relay.on(SUBSCRIPTION_EVENTS.submitted, async (tx, event) => {
      await this.generate(tx, event, 'SUBSCRIPTION_FORM');
      return [];
    });
    this.relay.on(SUBSCRIPTION_EVENTS.allocated, async (tx, event) => {
      await this.generate(tx, event, 'ALLOCATION_CONFIRMATION');
      return [];
    });
  }

  private async generate(
    tx: Transaction,
    event: OutboxEventRecord,
    type: 'SUBSCRIPTION_FORM' | 'ALLOCATION_CONFIRMATION',
  ): Promise<void> {
    const found = (await this.subscriptions.byIds(tx, [event.aggregateId])).get(event.aggregateId);
    if (!found) return;
    const detail = await this.issuances.findForRegistry(tx, found.issuanceId);
    const locale = await this.users.localeOfInvestor(tx, found.investorId);
    const content = await this.render(
      found,
      detail.terms.nominalValue!,
      detail.issuance.legalIssuerName,
      type,
      locale,
    );
    const prefix = type === 'SUBSCRIPTION_FORM' ? 'subscription-form' : 'allocation-confirmation';
    await this.documents.storeGenerated(tx, event.tenantId, {
      type,
      name: `${prefix}-${found.issuanceCode}-${found.id.slice(0, 8)}.pdf`,
      confidentiality: 'INVESTOR_VISIBLE',
      ownerType: 'INVESTOR',
      investorId: found.investorId,
      issuanceId: found.issuanceId,
      content,
      mimeType: 'application/pdf',
    });
  }

  private render(
    found: SubscriptionWithNames,
    nominalValue: string,
    issuer: string | null,
    type: 'SUBSCRIPTION_FORM' | 'ALLOCATION_CONFIRMATION',
    locale: DocumentLocale,
  ): Promise<Buffer> {
    const t = TEXTS[locale];
    const money = (value: string | null) =>
      value === null ? '—' : formatMoney(value, found.currency, locale);
    const instant = (value: Date | null) => (value ? formatInstant(value, locale) : '—');
    const request: [string, string][] = [
      [t.unitsRequested, parseDecimal(found.requestedUnits).toString()],
      [t.nominalValue, money(nominalValue)],
      [t.amountRequested, money(found.requestedAmount)],
      [t.paymentReference, found.paymentReference ?? '—'],
      [t.submittedAt, instant(found.submittedAt)],
    ];
    return renderPdf({
      title: type === 'SUBSCRIPTION_FORM' ? t.formTitle : t.confirmationTitle,
      subtitle: `${found.issuanceName} (${found.issuanceCode})`,
      blocks: [
        {
          heading: t.subscriber,
          rows: [
            [t.investor, found.investorName],
            [t.issuer, issuer ?? '—'],
          ],
        },
        type === 'SUBSCRIPTION_FORM'
          ? {
              heading: t.request,
              rows: [
                ...request,
                [t.documentsAccepted, instant(found.documentsAcceptedAt)],
                [t.eligibilityDeclared, instant(found.eligibilityDeclaredAt)],
              ],
            }
          : {
              heading: t.allocation,
              rows: [
                ...request.slice(0, 3),
                [
                  t.unitsAllocated,
                  found.allocatedUnits ? parseDecimal(found.allocatedUnits).toString() : '—',
                ],
                [t.amountDue, money(found.amountDue)],
                [t.paymentReference, found.paymentReference ?? '—'],
              ],
            },
        { paragraph: type === 'SUBSCRIPTION_FORM' ? t.formNote : t.confirmationNote },
      ],
      footer: DEMO_FOOTER[locale],
    });
  }
}
