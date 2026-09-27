import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, gte } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import { AuditWriter } from '../audit/audit-writer.js';
import {
  DATABASE,
  type Database,
  type Transaction,
  withoutTenantTransaction,
  withTenantTransaction,
} from '../database/database.js';
import { auditEvent } from '../database/schema.js';
import { Outbox } from '../outbox/outbox.js';
import { REDIS } from '../redis/redis.module.js';

/** Events of the detection of unusual access (SPEC §24). Aggregate: the user concerned. */
export const SECURITY_EVENTS = {
  /** A successful sign-in from an address never used by the account in the last 180 days. */
  newSignInAddress: 'core.security.new-sign-in-address',
  /** Many refused requests of one account in a short time. */
  suspiciousActivity: 'core.security.suspicious-activity',
} as const;

/** 10 refusals in 10 minutes: far above a user's mistakes, typical of someone probing. */
const DENIALS = { limit: 10, windowSeconds: 10 * 60 } as const;
const KNOWN_ADDRESS_DAYS = 180;

/**
 * Detection of unusual access (SPEC §24, P16-1, D-100): a sign-in from a new address, and a burst
 * of refused requests. Both are written in the audit log and told through the outbox; the
 * identity module decides who is notified.
 */
@Injectable()
export class SecurityMonitor {
  private readonly logger = new Logger(SecurityMonitor.name);

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(DATABASE) private readonly db: Database,
    private readonly audit: AuditWriter,
    private readonly outbox: Outbox,
  ) {}

  /**
   * Called after a successful sign-in, before it is audited. Nothing is raised for the very first
   * sign-in of an account, nor without a known address.
   */
  async signedIn(
    user: { userId: string; tenantId: string | null },
    ipAddress: string | null | undefined,
  ) {
    if (!ipAddress) return;
    await this.within(user.tenantId, async (tx) => {
      const since = new Date(Date.now() - KNOWN_ADDRESS_DAYS * 24 * 3600 * 1000);
      const previous = await tx
        .select({ ipAddress: auditEvent.ipAddress })
        .from(auditEvent)
        .where(
          and(
            eq(auditEvent.actorUserId, user.userId),
            eq(auditEvent.action, 'AUTH_SIGN_IN'),
            eq(auditEvent.result, 'SUCCESS'),
            gte(auditEvent.occurredAt, since),
          ),
        );
      if (previous.length === 0 || previous.some((row) => row.ipAddress === ipAddress)) return;
      await this.audit.recordIn(tx, {
        tenantId: user.tenantId,
        actorUserId: user.userId,
        action: 'SECURITY_NEW_SIGN_IN_ADDRESS',
        resourceType: 'user',
        resourceId: user.userId,
        result: 'SUCCESS',
        ipAddress,
      });
      await this.publish(tx, user, SECURITY_EVENTS.newSignInAddress);
    });
  }

  /** Counts a refused request of a signed-in user; the limit reached raises one alert. */
  async accessDenied(user: { userId: string; tenantId: string | null }, ipAddress: string | null) {
    const key = `security:denials:${user.userId}`;
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, DENIALS.windowSeconds);
    if (count !== DENIALS.limit) return;
    this.logger.warn({ userId: user.userId }, 'Suspicious activity: repeated access denials');
    await this.within(user.tenantId, async (tx) => {
      await this.audit.recordIn(tx, {
        tenantId: user.tenantId,
        actorUserId: user.userId,
        action: 'SECURITY_SUSPICIOUS_ACTIVITY',
        resourceType: 'user',
        resourceId: user.userId,
        result: 'DENIED',
        reason: `REPEATED_ACCESS_DENIALS ${DENIALS.limit} in ${DENIALS.windowSeconds}s`,
        ipAddress,
      });
      await this.publish(tx, user, SECURITY_EVENTS.suspiciousActivity);
    });
  }

  private within(tenantId: string | null, work: (tx: Transaction) => Promise<void>) {
    return tenantId
      ? withTenantTransaction(this.db, tenantId, work)
      : withoutTenantTransaction(this.db, work);
  }

  /** Only accounts of an organisation are notified: the outbox is organised by tenant. */
  private async publish(
    tx: Transaction,
    user: { userId: string; tenantId: string | null },
    eventType: string,
  ) {
    if (!user.tenantId) return;
    await this.outbox.publish(tx, {
      tenantId: user.tenantId,
      eventType,
      aggregateType: 'user',
      aggregateId: user.userId,
      payload: {},
    });
  }
}
