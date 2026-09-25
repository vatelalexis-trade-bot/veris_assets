import { Injectable, type OnModuleInit } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { Transaction } from '../../../core/database/database.js';
import {
  DOCUMENT_ADDED_EVENT,
  DocumentsService,
} from '../../../core/documents/documents.service.js';
import type { NotificationRequest } from '../../../core/notifications/notification.service.js';
import { OutboxRelay, type OutboxEventRecord } from '../../../core/outbox/outbox-relay.js';
import { UserDirectory } from '../../iam/index.js';
import { investor, kycCase } from '../infrastructure/schema.js';

/** Business events of the investor-compliance module (outbox, SPEC §15). */
export const INVESTOR_EVENTS = {
  /** A case waits for a decision. Aggregate: the case; payload: `investorId`. */
  kycSubmitted: 'investor.kyc.submitted',
  /** A case was approved, rejected or sent back. Payload: `investorId`, `decision`, `validUntil`. */
  kycDecided: 'investor.kyc.decided',
  /** An approval expires in 30 days at most. Payload: `investorId`, `validUntil`. */
  kycExpiring: 'investor.kyc.expiring',
  /** An approval has expired. Payload: `investorId`. */
  kycExpired: 'investor.kyc.expired',
} as const;

type Payload = { investorId?: string; decision?: string; validUntil?: string | null };

/**
 * Who is told what (SPEC §15): Compliance Officers for the cases to review and the expiries, the
 * preparer for the decisions, the investor's portal accounts for what concerns the investor.
 * Also tells the documents which investors exist (the core never reads the investor table).
 */
@Injectable()
export class InvestorEvents implements OnModuleInit {
  constructor(
    private readonly relay: OutboxRelay,
    private readonly users: UserDirectory,
    private readonly documents: DocumentsService,
  ) {}

  onModuleInit(): void {
    this.documents.useOwnerCheck('INVESTOR', async (tx, id) => {
      const [found] = await tx
        .select({ id: investor.id })
        .from(investor)
        .where(eq(investor.id, id));
      return found !== undefined;
    });

    this.relay.on(INVESTOR_EVENTS.kycSubmitted, async (tx, event) =>
      (await this.users.activeUsersWithRole(tx, 'COMPLIANCE_OFFICER')).map((userId) =>
        this.about(event, userId, 'KYC_REVIEW_REQUESTED'),
      ),
    );

    this.relay.on(INVESTOR_EVENTS.kycDecided, async (tx, event) => {
      const payload = event.payload as Payload;
      const [found] = await tx
        .select({ preparedBy: kycCase.preparedBy })
        .from(kycCase)
        .where(eq(kycCase.id, event.aggregateId));
      if (payload.decision === 'IN_PROGRESS') {
        return found ? [this.about(event, found.preparedBy, 'KYC_RETURNED')] : [];
      }
      const type = payload.decision === 'APPROVED' ? 'KYC_APPROVED' : 'KYC_REJECTED';
      const params: Record<string, string> = payload.validUntil
        ? { validUntil: payload.validUntil }
        : {};
      const recipients = [
        ...(found ? [found.preparedBy] : []),
        ...(await this.investorAccounts(tx, payload)),
      ];
      return [...new Set(recipients)].map((userId) => this.about(event, userId, type, params));
    });

    this.relay.on(INVESTOR_EVENTS.kycExpiring, (tx, event) =>
      this.investorAndCompliance(tx, event, 'KYC_EXPIRING_SOON'),
    );
    this.relay.on(INVESTOR_EVENTS.kycExpired, (tx, event) =>
      this.investorAndCompliance(tx, event, 'KYC_EXPIRED'),
    );

    this.relay.on(DOCUMENT_ADDED_EVENT, async (tx, event) =>
      (await this.investorAccounts(tx, event.payload as Payload)).map((userId) => ({
        userId,
        type: 'DOCUMENT_ADDED' as const,
        resourceType: 'document',
        resourceId: event.aggregateId,
      })),
    );
  }

  private async investorAndCompliance(
    tx: Transaction,
    event: OutboxEventRecord,
    type: 'KYC_EXPIRING_SOON' | 'KYC_EXPIRED',
  ): Promise<NotificationRequest[]> {
    const payload = event.payload as Payload;
    const params: Record<string, string> = payload.validUntil
      ? { validUntil: payload.validUntil }
      : {};
    const recipients = [
      ...(await this.investorAccounts(tx, payload)),
      ...(await this.users.activeUsersWithRole(tx, 'COMPLIANCE_OFFICER')),
    ];
    return [...new Set(recipients)].map((userId) => this.about(event, userId, type, params));
  }

  private investorAccounts(tx: Transaction, payload: Payload): Promise<string[]> {
    return payload.investorId
      ? this.users.activeUsersOfInvestor(tx, payload.investorId)
      : Promise.resolve([]);
  }

  private about(
    event: OutboxEventRecord,
    userId: string,
    type: NotificationRequest['type'],
    params: Record<string, string> = {},
  ): NotificationRequest {
    return { userId, type, params, resourceType: 'kyc_case', resourceId: event.aggregateId };
  }
}
