import { Inject, Injectable } from '@nestjs/common';
import {
  isMandatoryCategory,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_TYPES,
  type NotificationCategory,
  type NotificationType,
} from '@virtus/shared';
import { and, count, desc, eq, isNull, type SQL } from 'drizzle-orm';
import type { RequestUser } from '../context/request-context.js';
import {
  DATABASE,
  type Database,
  type Transaction,
  withoutTenantTransaction,
  withTenantTransaction,
} from '../database/database.js';
import { notification, notificationPreference } from '../database/schema.js';
import { AppError } from '../errors/app-error.js';
import { offsetOf, type Page, type Pagination } from '../http/pagination.js';
import { JobQueue } from '../jobs/job-queue.js';
import { QUEUES } from '../jobs/queues.js';

/** A notification to create for one user, returned by the outbox handlers of the modules. */
export interface NotificationRequest {
  userId: string;
  type: NotificationType;
  /** Placeholder values: identifiers and codes only. */
  params?: Readonly<Record<string, string>>;
  resourceType?: string;
  resourceId?: string;
}

/** Data of the `notification-email` job: identifiers and codes only. */
export interface NotificationEmailJob {
  tenantId: string | null;
  userId: string;
  type: NotificationType;
  params: Readonly<Record<string, string>>;
}

export interface ChannelPreference {
  category: NotificationCategory;
  inApp: boolean;
  email: boolean;
  /** Security and workflow notifications cannot be switched off. */
  mandatory: boolean;
}

/** Channels of a category nobody has chosen yet: both on. */
const DEFAULT_CHANNELS = { inApp: true, email: true } as const;

export type NotificationRow = typeof notification.$inferSelect;

/** Runs `work` in the scope of the user: its tenant, or no tenant for platform users. */
function withUserScope<T>(db: Database, user: RequestUser, work: (tx: Transaction) => Promise<T>) {
  return user.tenantId
    ? withTenantTransaction(db, user.tenantId, work)
    : withoutTenantTransaction(db, work);
}

/** In-app notifications, their emails and each user's preferences (SPEC §15). */
@Injectable()
export class NotificationService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly jobs: JobQueue,
  ) {}

  /**
   * Creates the notifications of an outbox event, in the transaction that marks it delivered.
   * Delivering the same event twice creates each notification once.
   */
  async createForEvent(
    tx: Transaction,
    event: { id: string; tenantId: string; eventType: string },
    requests: readonly NotificationRequest[],
  ): Promise<void> {
    for (const request of requests) {
      const category = NOTIFICATION_TYPES[request.type].category;
      const channels = await this.channelsOf(tx, request.userId, category);
      const params = request.params ?? {};
      if (channels.inApp) {
        await tx
          .insert(notification)
          .values({
            tenantId: event.tenantId,
            userId: request.userId,
            category,
            eventType: event.eventType,
            titleKey: request.type,
            params,
            resourceType: request.resourceType ?? null,
            resourceId: request.resourceId ?? null,
            sourceEventId: event.id,
          })
          .onConflictDoNothing({ target: [notification.sourceEventId, notification.userId] });
      }
      if (channels.email) {
        const job: NotificationEmailJob = {
          tenantId: event.tenantId,
          userId: request.userId,
          type: request.type,
          params,
        };
        await this.jobs.sendIn(tx, QUEUES.notificationEmail.name, job);
      }
    }
  }

  private async channelsOf(tx: Transaction, userId: string, category: NotificationCategory) {
    if (isMandatoryCategory(category)) return { inApp: true, email: true };
    const [chosen] = await tx
      .select({ inApp: notificationPreference.inApp, email: notificationPreference.email })
      .from(notificationPreference)
      .where(
        and(
          eq(notificationPreference.userId, userId),
          eq(notificationPreference.category, category),
        ),
      );
    return chosen ?? DEFAULT_CHANNELS;
  }

  async list(
    user: RequestUser,
    query: Pagination & { unreadOnly?: boolean },
  ): Promise<Page<NotificationRow>> {
    const conditions: SQL[] = [eq(notification.userId, user.userId)];
    if (query.unreadOnly) conditions.push(isNull(notification.readAt));
    return withUserScope(this.db, user, async (tx) => {
      const where = and(...conditions);
      const [rows, [total]] = await Promise.all([
        tx
          .select()
          .from(notification)
          .where(where)
          .orderBy(desc(notification.createdAt), desc(notification.id))
          .limit(query.pageSize)
          .offset(offsetOf(query)),
        tx.select({ value: count() }).from(notification).where(where),
      ]);
      return {
        data: rows,
        meta: { page: query.page, pageSize: query.pageSize, total: total?.value ?? 0 },
      };
    });
  }

  async unreadCount(user: RequestUser): Promise<number> {
    return withUserScope(this.db, user, async (tx) => {
      const [result] = await tx
        .select({ value: count() })
        .from(notification)
        .where(and(eq(notification.userId, user.userId), isNull(notification.readAt)));
      return result?.value ?? 0;
    });
  }

  async markRead(user: RequestUser, id: string): Promise<void> {
    await withUserScope(this.db, user, async (tx) => {
      const [found] = await tx
        .select({ readAt: notification.readAt })
        .from(notification)
        .where(and(eq(notification.id, id), eq(notification.userId, user.userId)));
      // Somebody else's notification is as invisible as a missing one.
      if (!found) throw new AppError('RESOURCE_NOT_FOUND');
      if (found.readAt) return;
      await tx.update(notification).set({ readAt: new Date() }).where(eq(notification.id, id));
    });
  }

  async markAllRead(user: RequestUser): Promise<void> {
    await withUserScope(this.db, user, (tx) =>
      tx
        .update(notification)
        .set({ readAt: new Date() })
        .where(and(eq(notification.userId, user.userId), isNull(notification.readAt))),
    );
  }

  async preferences(user: RequestUser): Promise<ChannelPreference[]> {
    return withUserScope(this.db, user, (tx) => this.readPreferences(tx, user.userId));
  }

  /** Saves the choices of the user; switching off a mandatory category is refused. */
  async updatePreferences(
    user: RequestUser,
    choices: readonly { category: NotificationCategory; inApp: boolean; email: boolean }[],
  ): Promise<ChannelPreference[]> {
    const refused = choices.filter(
      (choice) => isMandatoryCategory(choice.category) && !(choice.inApp && choice.email),
    );
    if (refused.length > 0) {
      throw new AppError(
        'VALIDATION_FAILED',
        refused.map((choice) => ({ code: 'MANDATORY_CATEGORY', field: choice.category })),
      );
    }
    return withUserScope(this.db, user, async (tx) => {
      for (const choice of choices.filter((item) => !isMandatoryCategory(item.category))) {
        await tx
          .insert(notificationPreference)
          .values({ tenantId: user.tenantId, userId: user.userId, ...choice })
          .onConflictDoUpdate({
            target: [notificationPreference.userId, notificationPreference.category],
            set: { inApp: choice.inApp, email: choice.email, updatedAt: new Date() },
          });
      }
      return this.readPreferences(tx, user.userId);
    });
  }

  private async readPreferences(tx: Transaction, userId: string): Promise<ChannelPreference[]> {
    const rows = await tx
      .select()
      .from(notificationPreference)
      .where(eq(notificationPreference.userId, userId));
    const chosen = new Map(rows.map((row) => [row.category, row]));
    return NOTIFICATION_CATEGORIES.map((category) => {
      const mandatory = isMandatoryCategory(category);
      const row = chosen.get(category);
      return {
        category,
        inApp: mandatory || (row?.inApp ?? DEFAULT_CHANNELS.inApp),
        email: mandatory || (row?.email ?? DEFAULT_CHANNELS.email),
        mandatory,
      };
    });
  }
}
