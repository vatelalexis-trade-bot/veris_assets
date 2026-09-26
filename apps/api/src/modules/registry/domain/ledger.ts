// Pure rules of the append-only ledger (SPEC §10.3, §10.4; docs/ARCHITECTURE.md §4.6): what each
// movement does to the positions, the chained hash, and the invariants recomputed from the entries.
import { parseDecimal, type Decimal } from '@virtus/shared';

export const LEDGER_ENTRY_TYPES = [
  'ISSUANCE',
  'ALLOCATION',
  'TRANSFER',
  'BLOCK',
  'UNBLOCK',
  'REDEMPTION',
  'CANCELLATION',
  'CORRECTION',
] as const;
export type LedgerEntryType = (typeof LEDGER_ENTRY_TYPES)[number];

/** Hash "before" the first entry of an issuance. */
export const ZERO_HASH = '0'.repeat(64);

/** The fields of an entry that its hash protects. */
export interface HashedEntry {
  issuanceId: string;
  sequenceNo: number;
  type: LedgerEntryType;
  sourceAccountId: string | null;
  destinationAccountId: string | null;
  quantity: string;
  effectiveDate: string;
  recordedAt: Date;
  businessReference: string;
  reversesEntryId: string | null;
  initiatedByUserId: string | null;
  initiatedByService: string | null;
  metadata: Record<string, string>;
  correlationId: string | null;
}

/**
 * What `entry_hash = SHA-256(previous_hash ‖ canonical representation)` is computed on. The
 * representation lists the fields in a fixed order, quantities normalised ("100.0000" and "100"
 * give the same hash) and metadata keys sorted, so the database's formatting never changes the
 * result. The hashing itself is done outside the (pure) domain.
 */
export function canonicalEntry(previousHash: string, entry: HashedEntry): string {
  const canonical = JSON.stringify([
    entry.issuanceId,
    entry.sequenceNo,
    entry.type,
    entry.sourceAccountId,
    entry.destinationAccountId,
    parseDecimal(entry.quantity).toString(),
    entry.effectiveDate,
    entry.recordedAt.toISOString(),
    entry.businessReference,
    entry.reversesEntryId,
    entry.initiatedByUserId,
    entry.initiatedByService,
    Object.entries(entry.metadata).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    entry.correlationId,
  ]);
  return `${previousHash}|${canonical}`;
}

/** Hash of an entry chained to the previous one (SHA-256 of `canonicalEntry`). */
export type EntryHasher = (previousHash: string, entry: HashedEntry) => string;

/** Change of one account's quantities by a movement. */
export interface PositionDelta {
  accountId: string;
  held: Decimal;
  blocked: Decimal;
}

/**
 * Effect of a movement on the positions (docs/ARCHITECTURE.md §4.6): a movement with a source and
 * a destination moves held units; BLOCK and UNBLOCK change the blocked units of one account.
 */
export function positionDeltas(entry: {
  type: LedgerEntryType;
  sourceAccountId: string | null;
  destinationAccountId: string | null;
  quantity: string;
}): PositionDelta[] {
  const quantity = parseDecimal(entry.quantity);
  const zero = parseDecimal('0');
  if (entry.type === 'BLOCK' || entry.type === 'UNBLOCK') {
    const account = entry.sourceAccountId ?? entry.destinationAccountId!;
    return [
      {
        accountId: account,
        held: zero,
        blocked: entry.type === 'BLOCK' ? quantity : quantity.neg(),
      },
    ];
  }
  return [
    ...(entry.sourceAccountId
      ? [{ accountId: entry.sourceAccountId, held: quantity.neg(), blocked: zero }]
      : []),
    ...(entry.destinationAccountId
      ? [{ accountId: entry.destinationAccountId, held: quantity, blocked: zero }]
      : []),
  ];
}

export interface Holding {
  held: Decimal;
  blocked: Decimal;
}

/** Quantities of every account rebuilt from the movements alone, in sequence order. */
export function replay(
  entries: readonly {
    type: LedgerEntryType;
    sourceAccountId: string | null;
    destinationAccountId: string | null;
    quantity: string;
  }[],
): Map<string, Holding> {
  const holdings = new Map<string, Holding>();
  for (const entry of entries) {
    for (const delta of positionDeltas(entry)) {
      const current = holdings.get(delta.accountId) ?? {
        held: parseDecimal('0'),
        blocked: parseDecimal('0'),
      };
      holdings.set(delta.accountId, {
        held: current.held.plus(delta.held),
        blocked: current.blocked.plus(delta.blocked),
      });
    }
  }
  return holdings;
}

export type InvariantBreach =
  | { invariant: 1; accountId: string; detail: 'NEGATIVE' | 'BLOCKED_ABOVE_HELD' }
  | { invariant: 2; accountId: string; detail: 'POSITION_DIFFERS_FROM_LEDGER' }
  | { invariant: 3; detail: 'ALLOCATED_ABOVE_TOTAL_UNITS' }
  | { invariant: 5; sequenceNo: number; detail: 'SEQUENCE_GAP' | 'HASH_MISMATCH' };

/**
 * Invariants 1, 2, 3 and 5 of SPEC §10.4 for one issuance: positions against the replayed
 * ledger, investors' units within the total, and the unbroken hash chain.
 */
export function checkInvariants(input: {
  totalUnits: string | null;
  treasuryAccountId: string | null;
  positions: readonly { accountId: string; held: string; blocked: string }[];
  entries: readonly (HashedEntry & { previousHash: string; entryHash: string })[];
  hash: EntryHasher;
}): InvariantBreach[] {
  const breaches: InvariantBreach[] = [];
  const zero = parseDecimal('0');
  const expected = replay(input.entries);
  const seen = new Set<string>();
  let investorUnits = zero;
  for (const row of input.positions) {
    seen.add(row.accountId);
    const held = parseDecimal(row.held);
    const blocked = parseDecimal(row.blocked);
    if (held.lt(zero) || blocked.lt(zero))
      breaches.push({ invariant: 1, accountId: row.accountId, detail: 'NEGATIVE' });
    else if (blocked.gt(held))
      breaches.push({ invariant: 1, accountId: row.accountId, detail: 'BLOCKED_ABOVE_HELD' });
    const replayed = expected.get(row.accountId) ?? { held: zero, blocked: zero };
    if (!replayed.held.eq(held) || !replayed.blocked.eq(blocked))
      breaches.push({
        invariant: 2,
        accountId: row.accountId,
        detail: 'POSITION_DIFFERS_FROM_LEDGER',
      });
    if (row.accountId !== input.treasuryAccountId) investorUnits = investorUnits.plus(held);
  }
  for (const [accountId, holding] of expected) {
    if (!seen.has(accountId) && !(holding.held.isZero() && holding.blocked.isZero()))
      breaches.push({ invariant: 2, accountId, detail: 'POSITION_DIFFERS_FROM_LEDGER' });
  }
  if (input.totalUnits !== null && investorUnits.gt(parseDecimal(input.totalUnits)))
    breaches.push({ invariant: 3, detail: 'ALLOCATED_ABOVE_TOTAL_UNITS' });
  let previous = ZERO_HASH;
  input.entries.forEach((entry, index) => {
    if (entry.sequenceNo !== index + 1)
      breaches.push({ invariant: 5, sequenceNo: entry.sequenceNo, detail: 'SEQUENCE_GAP' });
    if (entry.previousHash !== previous || input.hash(previous, entry) !== entry.entryHash)
      breaches.push({ invariant: 5, sequenceNo: entry.sequenceNo, detail: 'HASH_MISMATCH' });
    previous = entry.entryHash;
  });
  return breaches;
}
