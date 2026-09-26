import { Inject, Injectable } from '@nestjs/common';
import { parseDecimal } from '@virtus/shared';
import { eq } from 'drizzle-orm';
import { AuditWriter } from '../../../core/audit/audit-writer.js';
import { currentUser } from '../../../core/context/request-context.js';
import {
  DATABASE,
  type Database,
  type Transaction,
  withCurrentTenant,
} from '../../../core/database/database.js';
import { AppError } from '../../../core/errors/app-error.js';
import { Outbox } from '../../../core/outbox/outbox.js';
import { CircuitBreaker } from '../../../core/providers/circuit-breaker.js';
import {
  PAYMENT_PROVIDER,
  type PaymentProvider,
} from '../../../core/providers/payment-provider.js';
import { subscriptionPayment } from '../infrastructure/schema.js';
import { LedgerWriter } from './ledger-writer.js';
import { PAYMENT_EVENTS } from './subscription-event-types.js';
import { SubscriptionsService, type SubscriptionWithNames } from './subscriptions.service.js';

export type PaymentRow = typeof subscriptionPayment.$inferSelect;

/**
 * Fictitious payment of an allocated subscription (SPEC §9.2, §4.8, D-009). The issuer's staff
 * prepare the confirmation for the amount due; an Issuer Administrator other than the preparer
 * confirms it once the (fictitious) provider says it was received: UNBLOCK of the units and
 * PAYMENT_PENDING → PAYMENT_CONFIRMED → ALLOCATED, in one transaction. No real payment is made.
 */
@Injectable()
export class PaymentsService {
  private readonly provider = new CircuitBreaker();

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(PAYMENT_PROVIDER) private readonly payments: PaymentProvider,
    private readonly subscriptions: SubscriptionsService,
    private readonly ledger: LedgerWriter,
    private readonly audit: AuditWriter,
    private readonly outbox: Outbox,
  ) {}

  /** The payment of a subscription, or null while none was prepared. */
  async get(subscriptionId: string): Promise<PaymentRow | null> {
    // Visible to whoever sees the subscription (an investor, its own).
    await this.subscriptions.get(subscriptionId);
    return withCurrentTenant(this.db, async (tx) => (await this.find(tx, subscriptionId)) ?? null);
  }

  prepare(subscriptionId: string): Promise<PaymentRow> {
    return withCurrentTenant(this.db, async (tx, tenantId) => {
      const { found } = await this.subscriptions.lockWithIssuance(tx, subscriptionId);
      if (found.status !== 'PAYMENT_PENDING') throw new AppError('INVALID_STATE_TRANSITION');
      const existing = await this.find(tx, subscriptionId);
      if (existing && existing.status !== 'FAILED') throw new AppError('INVALID_STATE_TRANSITION');
      const userId = currentUser().userId;
      const amount = found.amountDue!;
      const [row] = existing
        ? await tx
            .update(subscriptionPayment)
            .set({
              status: 'PREPARED',
              amount,
              preparedBy: userId,
              preparedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(subscriptionPayment.id, existing.id))
            .returning()
        : await tx
            .insert(subscriptionPayment)
            .values({
              tenantId,
              subscriptionId,
              amount,
              currency: found.currency,
              status: 'PREPARED',
              preparedBy: userId,
              preparedAt: new Date(),
              createdBy: userId,
            })
            .returning();
      const { reference } = await this.provider.call(() =>
        this.payments.prepare({ paymentId: row!.id, amount, currency: found.currency }),
      );
      await tx
        .update(subscriptionPayment)
        .set({ providerReference: reference })
        .where(eq(subscriptionPayment.id, row!.id));
      await this.audit.recordIn(tx, {
        tenantId,
        action: 'PAYMENT_PREPARED',
        resourceType: 'subscription',
        resourceId: subscriptionId,
        newValue: { amount, currency: found.currency, providerReference: reference },
        result: 'SUCCESS',
      });
      await this.publish(tx, tenantId, PAYMENT_EVENTS.prepared, found, userId);
      return (await this.find(tx, subscriptionId))!;
    });
  }

  /** Four eyes: never by the preparer. The units become available to the investor. */
  confirm(subscriptionId: string): Promise<PaymentRow> {
    return withCurrentTenant(this.db, async (tx, tenantId) => {
      const { found, detail } = await this.subscriptions.lockWithIssuance(tx, subscriptionId);
      const payment = await this.find(tx, subscriptionId);
      if (found.status !== 'PAYMENT_PENDING' || payment?.status !== 'PREPARED')
        throw new AppError('INVALID_STATE_TRANSITION');
      const confirmed = await this.subscriptions.advance(
        tx,
        tenantId,
        found,
        'PAYMENT_CONFIRMED',
        payment.preparedBy,
      );
      const { received } = await this.provider.call(() =>
        this.payments.confirm(payment.providerReference!),
      );
      if (!received) throw new AppError('PAYMENT_NOT_RECEIVED');
      const account = await this.ledger.account(
        tx,
        tenantId,
        found.issuanceId,
        found.investorId,
        found.currency,
      );
      await this.ledger.post(tx, tenantId, found.issuanceId, [
        {
          type: 'UNBLOCK',
          sourceAccountId: account,
          destinationAccountId: account,
          quantity: found.allocatedUnits!,
          businessReference: `payment:${payment.id}`,
          metadata: { subscriptionId, paymentId: payment.id },
        },
      ]);
      await this.ledger.assertConsistent(tx, found.issuanceId, detail.terms.totalUnits);
      await this.subscriptions.advance(tx, tenantId, confirmed, 'ALLOCATED');
      const userId = currentUser().userId;
      await tx
        .update(subscriptionPayment)
        .set({
          status: 'CONFIRMED',
          confirmedBy: userId,
          confirmedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(subscriptionPayment.id, payment.id));
      await this.audit.recordIn(tx, {
        tenantId,
        action: 'PAYMENT_CONFIRMED',
        resourceType: 'subscription',
        resourceId: subscriptionId,
        newValue: { amount: payment.amount, currency: payment.currency },
        result: 'SUCCESS',
      });
      await this.publish(tx, tenantId, PAYMENT_EVENTS.confirmed, found, payment.preparedBy);
      return (await this.find(tx, subscriptionId))!;
    });
  }

  private async publish(
    tx: Transaction,
    tenantId: string,
    eventType: string,
    found: SubscriptionWithNames,
    preparedBy: string | null,
  ): Promise<void> {
    await this.outbox.publish(tx, {
      tenantId,
      eventType,
      aggregateType: 'subscription',
      aggregateId: found.id,
      payload: {
        investorId: found.investorId,
        code: found.issuanceCode,
        units: parseDecimal(found.allocatedUnits ?? '0').toString(),
        ...(preparedBy ? { preparedBy } : {}),
      },
    });
  }

  private async find(tx: Transaction, subscriptionId: string): Promise<PaymentRow | undefined> {
    const [row] = await tx
      .select()
      .from(subscriptionPayment)
      .where(eq(subscriptionPayment.subscriptionId, subscriptionId));
    return row;
  }
}
