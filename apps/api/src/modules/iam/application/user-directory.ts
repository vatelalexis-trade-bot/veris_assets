import { Injectable } from '@nestjs/common';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Transaction } from '../../../core/database/database.js';
import type { RoleCode } from '../domain/roles.js';
import { role, user, userRole } from '../infrastructure/schema.js';

/**
 * Names of users, for the screens of other modules (e.g. the author of an audit entry). Reads in
 * the caller's transaction: row level security only shows the users of its tenant.
 */
@Injectable()
export class UserDirectory {
  async namesOf(tx: Transaction, ids: readonly string[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const rows = await tx
      .select({ id: user.id, name: user.name })
      .from(user)
      .where(inArray(user.id, unique));
    return new Map(rows.map((row) => [row.id, row.name]));
  }

  /** Active users of the tenant holding a role (e.g. the Compliance Officers to notify). */
  async activeUsersWithRole(tx: Transaction, roleCode: RoleCode): Promise<string[]> {
    const rows = await tx
      .selectDistinct({ id: user.id })
      .from(user)
      .innerJoin(userRole, eq(userRole.userId, user.id))
      .innerJoin(role, eq(role.id, userRole.roleId))
      .where(and(eq(role.code, roleCode), eq(user.status, 'ACTIVE')));
    return rows.map((row) => row.id);
  }

  /** Active portal accounts of an investor. */
  async activeUsersOfInvestor(tx: Transaction, investorId: string): Promise<string[]> {
    const rows = await tx
      .select({ id: user.id })
      .from(user)
      .where(and(eq(user.investorId, investorId), eq(user.status, 'ACTIVE')));
    return rows.map((row) => row.id);
  }

  /** Language of a user, for the documents generated for it. */
  async localeOf(tx: Transaction, userId: string | null): Promise<'en-GB' | 'fr-FR'> {
    if (!userId) return 'en-GB';
    const [row] = await tx.select({ locale: user.locale }).from(user).where(eq(user.id, userId));
    return row?.locale === 'fr-FR' ? 'fr-FR' : 'en-GB';
  }

  /** Language of an investor: the one of its first active account, English otherwise. */
  async localeOfInvestor(tx: Transaction, investorId: string): Promise<'en-GB' | 'fr-FR'> {
    const [row] = await tx
      .select({ locale: user.locale })
      .from(user)
      .where(and(eq(user.investorId, investorId), eq(user.status, 'ACTIVE')))
      .orderBy(asc(user.createdAt))
      .limit(1);
    return row?.locale === 'fr-FR' ? 'fr-FR' : 'en-GB';
  }
}
