import { Injectable } from '@nestjs/common';
import { inArray } from 'drizzle-orm';
import type { Transaction } from '../../../core/database/database.js';
import { user } from '../infrastructure/schema.js';

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
}
