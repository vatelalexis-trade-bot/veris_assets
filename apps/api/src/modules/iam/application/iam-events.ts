import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import {
  DATABASE,
  type Database,
  type Transaction,
  withoutTenantTransaction,
  withTenantTransaction,
} from '../../../core/database/database.js';
import { NotificationEmails } from '../../../core/notifications/notification-emails.js';
import { OutboxRelay, type OutboxEventRecord } from '../../../core/outbox/outbox-relay.js';
import { SECURITY_EVENTS } from '../../../core/security/security-monitor.js';
import { user, userInvitation } from '../infrastructure/schema.js';
import { BREAK_GLASS_EVENTS } from './break-glass.js';
import { UserDirectory } from './user-directory.js';

/** Business events of the identity module (outbox, SPEC §15). */
export const IAM_EVENTS = {
  /** The roles of a user were replaced. Aggregate: the user. */
  rolesChanged: 'iam.user.roles-changed',
  /** An invitation was accepted. Aggregate: the invitation; payload: `userId` of the new account. */
  invitationAccepted: 'iam.invitation.accepted',
} as const;

/**
 * Reactions of the identity module to its events: who is notified. Also tells the notification
 * emails where to find a user's address and language (the core never reads the user table).
 */
@Injectable()
export class IamEvents implements OnModuleInit {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly relay: OutboxRelay,
    private readonly emails: NotificationEmails,
    private readonly users: UserDirectory,
  ) {}

  onModuleInit(): void {
    this.relay.on(IAM_EVENTS.rolesChanged, (_tx, event) =>
      Promise.resolve([
        {
          userId: event.aggregateId,
          type: 'ROLES_CHANGED',
          resourceType: 'user',
          resourceId: event.aggregateId,
        },
      ]),
    );
    this.relay.on(IAM_EVENTS.invitationAccepted, (tx, event) => this.notifyInviter(tx, event));
    // Unusual access (SPEC §24): the account holder for a new address; the organisation's
    // administrators for a burst of refused requests.
    this.relay.on(SECURITY_EVENTS.newSignInAddress, (_tx, event) =>
      Promise.resolve([
        {
          userId: event.aggregateId,
          type: 'NEW_SIGN_IN_ADDRESS',
          resourceType: 'user',
          resourceId: event.aggregateId,
        },
      ]),
    );
    this.relay.on(BREAK_GLASS_EVENTS.started, async (tx, event) =>
      (await this.users.activeUsersWithRole(tx, 'ISSUER_ADMIN')).map((userId) => ({
        userId,
        type: 'BREAK_GLASS_STARTED' as const,
        resourceType: 'tenant',
        resourceId: event.aggregateId,
      })),
    );
    this.relay.on(SECURITY_EVENTS.suspiciousActivity, async (tx, event) =>
      (await this.users.activeUsersWithRole(tx, 'ISSUER_ADMIN')).map((userId) => ({
        userId,
        type: 'SUSPICIOUS_ACTIVITY' as const,
        resourceType: 'user',
        resourceId: event.aggregateId,
      })),
    );
    this.emails.useRecipientLookup((tenantId, userId) => this.recipient(tenantId, userId));
  }

  /** The person who sent the invitation, if they belong to the organisation. */
  private async notifyInviter(tx: Transaction, event: OutboxEventRecord) {
    const [invitation] = await tx
      .select({ invitedBy: userInvitation.invitedBy })
      .from(userInvitation)
      .where(eq(userInvitation.id, event.aggregateId));
    if (!invitation?.invitedBy) return [];
    // A Platform Administrator is not a member of the tenant: row level security hides them.
    const [inviter] = await tx
      .select({ id: user.id })
      .from(user)
      .where(eq(user.id, invitation.invitedBy));
    if (!inviter) return [];
    const newUserId = (event.payload as { userId?: string }).userId;
    return [
      {
        userId: inviter.id,
        type: 'INVITATION_ACCEPTED' as const,
        resourceType: 'user',
        ...(newUserId ? { resourceId: newUserId } : {}),
      },
    ];
  }

  private async recipient(tenantId: string | null, userId: string) {
    const read = (tx: Transaction) =>
      tx
        .select({ email: user.email, locale: user.locale, status: user.status })
        .from(user)
        .where(eq(user.id, userId));
    const [found] = tenantId
      ? await withTenantTransaction(this.db, tenantId, read)
      : await withoutTenantTransaction(this.db, read);
    if (!found) return null;
    return {
      email: found.email,
      locale: found.locale as 'en-GB' | 'fr-FR',
      active: found.status === 'ACTIVE',
    };
  }
}
