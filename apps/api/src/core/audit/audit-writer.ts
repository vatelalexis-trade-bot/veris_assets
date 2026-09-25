import { Inject, Injectable, Logger } from '@nestjs/common';
import { getRequestContext } from '../context/request-context.js';
import { DATABASE, type Database, withTenantTransaction } from '../database/database.js';
import { auditEvent } from '../database/schema.js';

export interface AuditEntry {
  /** Null for events without tenant (platform users, unknown accounts). */
  tenantId: string | null;
  actorUserId: string | null;
  actorRole?: string | null;
  action: string;
  resourceType?: string;
  resourceId?: string | null;
  result: 'SUCCESS' | 'DENIED' | 'FAILED';
  /** Machine-readable reason; never personal data (SPEC §17.2, §8.5). */
  reason?: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Minimal audit writer (SPEC §17). Phase 7 extends it (old/new values with masking, writing in the
 * business transaction). Entries hold identifiers only: no email, name or secret.
 */
@Injectable()
export class AuditWriter {
  private readonly logger = new Logger(AuditWriter.name);

  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async record(entry: AuditEntry): Promise<void> {
    const values = {
      tenantId: entry.tenantId,
      actorUserId: entry.actorUserId,
      actorRole: entry.actorRole ?? null,
      action: entry.action,
      resourceType: entry.resourceType ?? null,
      resourceId: entry.resourceId ?? null,
      source: 'WEB' as const,
      ipAddress: entry.ipAddress ?? null,
      userAgent: entry.userAgent ?? null,
      correlationId: getRequestContext()?.correlationId ?? null,
      result: entry.result,
      reason: entry.reason ?? null,
    };
    try {
      if (entry.tenantId) {
        await withTenantTransaction(this.db, entry.tenantId, (tx) =>
          tx.insert(auditEvent).values(values),
        );
      } else {
        await this.db.insert(auditEvent).values(values);
      }
    } catch (error) {
      // Security events must never be lost silently: the failure itself is logged.
      this.logger.error({ err: error, action: entry.action }, 'Audit entry could not be written');
      throw error;
    }
  }
}
