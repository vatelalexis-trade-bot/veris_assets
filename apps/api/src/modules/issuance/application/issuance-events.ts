import { Injectable, type OnModuleInit } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { Transaction } from '../../../core/database/database.js';
import { DocumentsService } from '../../../core/documents/documents.service.js';
import type { NotificationRequest } from '../../../core/notifications/notification.service.js';
import { OutboxRelay, type OutboxEventRecord } from '../../../core/outbox/outbox-relay.js';
import { UserDirectory } from '../../iam/index.js';
import { investorInvitation, issuance } from '../infrastructure/schema.js';

/** Business events of the issuance module (outbox, SPEC §15). Payload: the issuance `code`. */
export const ISSUANCE_EVENTS = {
  submitted: 'issuance.submitted',
  /** Approved or sent back to draft; payload `decision`. */
  decided: 'issuance.decided',
  opened: 'issuance.subscription-opened',
  cancelled: 'issuance.cancelled',
  /** An investor was invited; aggregate: the invitation; payload `investorId`. */
  investorInvited: 'issuance.investor-invited',
} as const;

type Payload = { code?: string; decision?: string; investorId?: string; issuanceId?: string };

/**
 * Who is told what: the other administrators for an issuance to approve, the submitter for the
 * decision, the invited investors for an invitation, an opening or a cancellation. Also tells the
 * documents which issuances exist (the core never reads the issuance table).
 */
@Injectable()
export class IssuanceEvents implements OnModuleInit {
  constructor(
    private readonly relay: OutboxRelay,
    private readonly users: UserDirectory,
    private readonly documents: DocumentsService,
  ) {}

  onModuleInit(): void {
    this.documents.useOwnerCheck('ISSUANCE', async (tx, id) => {
      const [found] = await tx
        .select({ id: issuance.id })
        .from(issuance)
        .where(eq(issuance.id, id));
      return found !== undefined;
    });

    this.relay.on(ISSUANCE_EVENTS.submitted, async (tx, event) => {
      const submitter = await this.submitterOf(tx, event.aggregateId);
      const admins = await this.users.activeUsersWithRole(tx, 'ISSUER_ADMIN');
      return admins
        .filter((userId) => userId !== submitter)
        .map((userId) => this.about(event, userId, 'ISSUANCE_REVIEW_REQUESTED'));
    });

    this.relay.on(ISSUANCE_EVENTS.decided, async (tx, event) => {
      const submitter = await this.submitterOf(tx, event.aggregateId);
      const decision = (event.payload as Payload).decision;
      return submitter
        ? [
            this.about(
              event,
              submitter,
              decision === 'APPROVED' ? 'ISSUANCE_APPROVED' : 'ISSUANCE_RETURNED',
            ),
          ]
        : [];
    });

    this.relay.on(ISSUANCE_EVENTS.opened, (tx, event) =>
      this.invitedAccounts(tx, event, 'ISSUANCE_OPENED'),
    );
    this.relay.on(ISSUANCE_EVENTS.cancelled, (tx, event) =>
      this.invitedAccounts(tx, event, 'ISSUANCE_CANCELLED'),
    );

    this.relay.on(ISSUANCE_EVENTS.investorInvited, async (tx, event) => {
      const payload = event.payload as Payload;
      if (!payload.investorId || !payload.issuanceId) return [];
      const accounts = await this.users.activeUsersOfInvestor(tx, payload.investorId);
      return accounts.map((userId) => ({
        userId,
        type: 'INVESTOR_INVITED' as const,
        params: { code: payload.code ?? '' },
        resourceType: 'issuance',
        resourceId: payload.issuanceId!,
      }));
    });
  }

  private async submitterOf(tx: Transaction, issuanceId: string): Promise<string | null> {
    const [found] = await tx
      .select({ submittedBy: issuance.submittedBy })
      .from(issuance)
      .where(eq(issuance.id, issuanceId));
    return found?.submittedBy ?? null;
  }

  /** Portal accounts of the investors still invited to the issuance. */
  private async invitedAccounts(
    tx: Transaction,
    event: OutboxEventRecord,
    type: NotificationRequest['type'],
  ): Promise<NotificationRequest[]> {
    const invited = await tx
      .select({ investorId: investorInvitation.investorId })
      .from(investorInvitation)
      .where(
        and(
          eq(investorInvitation.issuanceId, event.aggregateId),
          eq(investorInvitation.status, 'INVITED'),
        ),
      );
    const requests: NotificationRequest[] = [];
    for (const { investorId } of invited) {
      for (const userId of await this.users.activeUsersOfInvestor(tx, investorId)) {
        requests.push(this.about(event, userId, type));
      }
    }
    return requests;
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
      resourceType: 'issuance',
      resourceId: event.aggregateId,
    };
  }
}
