import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ROLE_PERMISSIONS, type Permission } from '@veris/shared';
import type { Redis } from 'ioredis';
import { AuditWriter } from '../../../core/audit/audit-writer.js';
import { DATABASE, type Database, withTenantTransaction } from '../../../core/database/database.js';
import { AppError } from '../../../core/errors/app-error.js';
import { Outbox } from '../../../core/outbox/outbox.js';
import { REDIS } from '../../../core/redis/redis.module.js';
import { TenantDirectory } from './tenant-directory.js';

/** Default duration of an emergency access (SPEC §4.1: 1 hour, [À valider]). */
export const BREAK_GLASS_SECONDS = 60 * 60;

/**
 * What an emergency access allows (docs/DATA_MODEL.md §5): the Auditor's read permissions on one
 * organisation — without exports, which create data — and ending the access.
 */
export const BREAK_GLASS_PERMISSIONS: readonly Permission[] = [
  ...(Object.keys(ROLE_PERMISSIONS.AUDITOR) as Permission[]).filter(
    (permission) => permission !== 'report:export',
  ),
  'break-glass:request',
];

export const BREAK_GLASS_EVENTS = {
  /** A Platform Administrator opened an emergency access. Aggregate: the tenant. */
  started: 'iam.break-glass.started',
} as const;

export interface BreakGlassGrant {
  id: string;
  tenantId: string;
  reason: string;
  startedAt: string;
  expiresAt: string;
}

/** Requests of the portal that are not worth tracing one by one (session and counters). */
const UNTRACED = new Set(['GET /api/v1/auth/me', 'GET /api/v1/notifications/unread-count']);

/**
 * Emergency ("break-glass") access of a Platform Administrator to one organisation (SPEC §4.1,
 * P16-6, D-103): asked with a reason, read-only, one hour at most, traced in the organisation's
 * audit log request by request, and told to its administrators. The grant lives in Redis and
 * expires by itself.
 */
@Injectable()
export class BreakGlass {
  private readonly logger = new Logger(BreakGlass.name);

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(DATABASE) private readonly db: Database,
    private readonly audit: AuditWriter,
    private readonly outbox: Outbox,
    private readonly tenants: TenantDirectory,
  ) {}

  async active(userId: string): Promise<BreakGlassGrant | null> {
    const stored = await this.redis.get(this.key(userId));
    return stored ? (JSON.parse(stored) as BreakGlassGrant) : null;
  }

  async start(userId: string, tenantId: string, reason: string): Promise<BreakGlassGrant> {
    if (!(await this.tenants.activeTenants()).some((tenant) => tenant.id === tenantId)) {
      throw new AppError('RESOURCE_NOT_FOUND');
    }
    if (await this.active(userId)) throw new AppError('INVALID_STATE_TRANSITION');
    const startedAt = new Date();
    const grant: BreakGlassGrant = {
      id: randomUUID(),
      tenantId,
      reason: reason.trim(),
      startedAt: startedAt.toISOString(),
      expiresAt: new Date(startedAt.getTime() + BREAK_GLASS_SECONDS * 1000).toISOString(),
    };
    await withTenantTransaction(this.db, tenantId, async (tx) => {
      await this.audit.recordIn(tx, {
        tenantId,
        actorUserId: userId,
        actorRole: 'PLATFORM_ADMIN',
        action: 'BREAK_GLASS_STARTED',
        resourceType: 'tenant',
        resourceId: tenantId,
        newValue: { accessId: grant.id, reason: grant.reason, expiresAt: grant.expiresAt },
        result: 'SUCCESS',
      });
      await this.outbox.publish(tx, {
        tenantId,
        eventType: BREAK_GLASS_EVENTS.started,
        aggregateType: 'tenant',
        aggregateId: tenantId,
        payload: { accessId: grant.id },
      });
    });
    await this.redis.set(this.key(userId), JSON.stringify(grant), 'EX', BREAK_GLASS_SECONDS);
    return grant;
  }

  async end(userId: string): Promise<void> {
    const grant = await this.active(userId);
    if (!grant) return;
    await this.redis.del(this.key(userId));
    await this.audit.record({
      tenantId: grant.tenantId,
      actorUserId: userId,
      actorRole: 'PLATFORM_ADMIN',
      action: 'BREAK_GLASS_ENDED',
      resourceType: 'tenant',
      resourceId: grant.tenantId,
      newValue: { accessId: grant.id },
      result: 'SUCCESS',
    });
  }

  /** Every request made under the access is written in the organisation's audit log. */
  traceRequest(userId: string, grant: BreakGlassGrant, method: string, path: string): void {
    if (UNTRACED.has(`${method} ${path}`)) return;
    this.audit
      .record({
        tenantId: grant.tenantId,
        actorUserId: userId,
        actorRole: 'PLATFORM_ADMIN',
        action: 'BREAK_GLASS_ACCESS',
        resourceType: 'tenant',
        resourceId: grant.tenantId,
        result: 'SUCCESS',
        reason: `${method} ${path}`,
      })
      .catch((error: unknown) =>
        this.logger.error({ err: error }, 'Emergency access request could not be audited'),
      );
  }

  private key(userId: string): string {
    return `break-glass:${userId}`;
  }
}
