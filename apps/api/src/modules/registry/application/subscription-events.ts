import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { Transaction } from '../../../core/database/database.js';
import type { NotificationRequest } from '../../../core/notifications/notification.service.js';
import { OutboxRelay, type OutboxEventRecord } from '../../../core/outbox/outbox-relay.js';
import { UserDirectory } from '../../iam/index.js';
import { ISSUANCE_EVENTS } from '../../issuance/index.js';
import { SUBSCRIPTION_EVENTS } from './subscription-event-types.js';
import { SubscriptionsService } from './subscriptions.service.js';

type Payload = { investorId?: string; code?: string; decision?: string };

/**
 * Who is told what: the issuer's staff for a subscription to review, the investor for the decision
 * or a cancellation by the issuer. A cancelled issuance cancels its open subscriptions.
 */
@Injectable()
export class SubscriptionEvents implements OnModuleInit {
  constructor(
    private readonly relay: OutboxRelay,
    private readonly users: UserDirectory,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  onModuleInit(): void {
    this.relay.on(SUBSCRIPTION_EVENTS.submitted, async (tx, event) => {
      const staff = [
        ...(await this.users.activeUsersWithRole(tx, 'ISSUER_OPERATOR')),
        ...(await this.users.activeUsersWithRole(tx, 'ISSUER_ADMIN')),
      ];
      return [...new Set(staff)].map((userId) =>
        this.about(event, userId, 'SUBSCRIPTION_SUBMITTED'),
      );
    });
    this.relay.on(SUBSCRIPTION_EVENTS.decided, async (tx, event) => {
      const payload = event.payload as Payload;
      const type =
        payload.decision === 'APPROVED' ? 'SUBSCRIPTION_APPROVED' : 'SUBSCRIPTION_REJECTED';
      return (await this.investorAccounts(tx, payload)).map((userId) =>
        this.about(event, userId, type),
      );
    });
    this.relay.on(SUBSCRIPTION_EVENTS.cancelledByIssuer, async (tx, event) =>
      (await this.investorAccounts(tx, event.payload as Payload)).map((userId) =>
        this.about(event, userId, 'SUBSCRIPTION_CANCELLED'),
      ),
    );
    // The investors are told by the issuance's own notification (ISSUANCE_CANCELLED).
    this.relay.on(ISSUANCE_EVENTS.cancelled, async (tx, event) => {
      await this.subscriptions.cancelForIssuance(tx, event.tenantId, event.aggregateId);
      return [];
    });
  }

  private investorAccounts(tx: Transaction, payload: Payload) {
    return payload.investorId
      ? this.users.activeUsersOfInvestor(tx, payload.investorId)
      : Promise.resolve([]);
  }

  private about(
    event: OutboxEventRecord,
    userId: string,
    type: NotificationRequest['type'],
  ): NotificationRequest {
    return {
      userId,
      type,
      params: { code: (event.payload as Payload).code ?? '' },
      resourceType: 'subscription',
      resourceId: event.aggregateId,
    };
  }
}
