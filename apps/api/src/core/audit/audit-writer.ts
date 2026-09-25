import { Inject, Injectable, Logger } from '@nestjs/common';
import { getRequestContext } from '../context/request-context.js';
import {
  DATABASE,
  type Database,
  type Transaction,
  withoutTenantTransaction,
  withTenantTransaction,
} from '../database/database.js';
import { auditEvent } from '../database/schema.js';
import { maskSensitive } from './masking.js';

export interface AuditEntry {
  /** Null for events without tenant (platform users, unknown accounts). */
  tenantId: string | null;
  /** Defaults to the signed-in user of the request; null for the system or an unknown account. */
  actorUserId?: string | null;
  /** Defaults to the roles of the signed-in user. */
  actorRole?: string | null;
  action: string;
  resourceType?: string;
  resourceId?: string | null;
  /** State before and after the change. Sensitive fields are masked before being written. */
  oldValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
  /** Fields holding personal data for this resource, masked on top of the common list. */
  personalKeys?: readonly string[];
  result: 'SUCCESS' | 'DENIED' | 'FAILED';
  /** Machine-readable reason; never personal data (SPEC §17.2, §8.5). */
  reason?: string;
  /** Default to the client of the request. */
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Audit log (SPEC §17). Two ways to write, both append-only:
 * - `recordIn(tx, …)`: in the transaction of the business operation, so the entry exists if and
 *   only if the operation is committed;
 * - `record(…)`: in a separate transaction, for what must be kept even when the operation fails
 *   (access denials, failed sign-ins).
 */
@Injectable()
export class AuditWriter {
  private readonly logger = new Logger(AuditWriter.name);

  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async recordIn(tx: Transaction, entry: AuditEntry): Promise<void> {
    await tx.insert(auditEvent).values(this.toRow(entry));
  }

  async record(entry: AuditEntry): Promise<void> {
    const row = this.toRow(entry);
    try {
      const write = (tx: Transaction) => tx.insert(auditEvent).values(row);
      if (entry.tenantId) {
        await withTenantTransaction(this.db, entry.tenantId, write, { separate: true });
      } else {
        await withoutTenantTransaction(this.db, write, { separate: true });
      }
    } catch (error) {
      // Security events must never be lost silently: the failure itself is logged.
      this.logger.error({ err: error, action: entry.action }, 'Audit entry could not be written');
      throw error;
    }
  }

  private toRow(entry: AuditEntry) {
    const context = getRequestContext();
    const user = context?.user;
    const mask = (value: Record<string, unknown> | null | undefined) =>
      value ? (maskSensitive(value, entry.personalKeys) as Record<string, unknown>) : null;
    return {
      tenantId: entry.tenantId,
      actorUserId: entry.actorUserId !== undefined ? entry.actorUserId : (user?.userId ?? null),
      actorRole:
        entry.actorRole !== undefined
          ? entry.actorRole
          : user
            ? user.roles.join(',') || null
            : null,
      action: entry.action,
      resourceType: entry.resourceType ?? null,
      resourceId: entry.resourceId ?? null,
      oldValue: mask(entry.oldValue),
      newValue: mask(entry.newValue),
      source: context?.source ?? ('SYSTEM' as const),
      ipAddress: entry.ipAddress !== undefined ? entry.ipAddress : (context?.ipAddress ?? null),
      userAgent: entry.userAgent !== undefined ? entry.userAgent : (context?.userAgent ?? null),
      correlationId: context?.correlationId ?? null,
      result: entry.result,
      reason: entry.reason ?? null,
    };
  }
}
