import { Injectable, type OnModuleInit } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { Transaction } from '../../../core/database/database.js';
import type { NotificationRequest } from '../../../core/notifications/notification.service.js';
import { OutboxRelay, type OutboxEventRecord } from '../../../core/outbox/outbox-relay.js';
import { UserDirectory } from '../../iam/index.js';
import { distribution, distributionLine } from '../infrastructure/schema.js';
import { DISTRIBUTION_EVENTS } from './distribution-events.js';

type Payload = { code?: string; issuanceId?: string; preparedBy?: string };

/**
 * Who is told what: the other Issuer Administrators for a distribution to approve and a payment
 * to confirm (four eyes); the investors of the lines once it is paid.
 */
@Injectable()
export class DistributionEvents implements OnModuleInit {
  constructor(
    private readonly relay: OutboxRelay,
    private readonly users: UserDirectory,
  ) {}

  onModuleInit(): void {
    for (const [eventType, type] of [
      [DISTRIBUTION_EVENTS.submitted, 'DISTRIBUTION_TO_APPROVE'],
      [DISTRIBUTION_EVENTS.paymentPrepared, 'DISTRIBUTION_PAYMENT_TO_CONFIRM'],
    ] as const) {
      this.relay.on(eventType, async (tx, event) => {
        const payload = event.payload as Payload;
        const admins = await this.users.activeUsersWithRole(tx, 'ISSUER_ADMIN');
        return admins
          .filter((userId) => userId !== payload.preparedBy)
          .map((userId) => this.about(event, userId, type));
      });
    }
    this.relay.on(DISTRIBUTION_EVENTS.paid, async (tx, event) => {
      const recipients = await this.investorAccounts(tx, event.aggregateId);
      return recipients.map((userId) => this.about(event, userId, 'DISTRIBUTION_PAID'));
    });
  }

  /** The users of the investors paid by the current calculation of the distribution. */
  private async investorAccounts(tx: Transaction, distributionId: string): Promise<string[]> {
    const lines = await tx
      .selectDistinct({ investorId: distributionLine.investorId })
      .from(distributionLine)
      .innerJoin(distribution, eq(distribution.id, distributionLine.distributionId))
      .where(
        and(
          eq(distributionLine.distributionId, distributionId),
          eq(distributionLine.calculationNo, distribution.calculationNo),
        ),
      );
    const accounts = await Promise.all(
      lines.map((line) => this.users.activeUsersOfInvestor(tx, line.investorId)),
    );
    return [...new Set(accounts.flat())];
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
      resourceType: 'distribution',
      resourceId: event.aggregateId,
    };
  }
}
