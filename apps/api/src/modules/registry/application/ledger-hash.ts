import { createHash } from 'node:crypto';
import { canonicalEntry, type HashedEntry } from '../domain/ledger.js';

/** `entry_hash = SHA-256(previous_hash ‖ canonical representation)` (docs/ARCHITECTURE.md §4.6). */
export function entryHash(previousHash: string, entry: HashedEntry): string {
  return createHash('sha256').update(canonicalEntry(previousHash, entry)).digest('hex');
}
