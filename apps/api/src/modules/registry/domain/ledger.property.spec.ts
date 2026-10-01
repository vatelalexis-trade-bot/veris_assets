// Properties of the append-only ledger checked on many generated histories (SPEC §10.4): a
// registry written movement by movement always meets the invariants, and any change made to its
// entries afterwards is found. The histories come from a seeded generator, so a failure replays.
import { parseDecimal } from '@veris/shared';
import { describe, expect, it } from 'vitest';
import { seededRandom } from '../../../test/seeded-random.js';
import { entryHash } from '../application/ledger-hash.js';
import { checkInvariants, ZERO_HASH, type HashedEntry, type LedgerEntryType } from './ledger.js';

type Entry = HashedEntry & { previousHash: string; entryHash: string };

const TREASURY = 'treasury';
const INVESTORS = ['alpine', 'baltic', 'cedar', 'delta'];
const HISTORIES = 200;

function chained(rows: readonly HashedEntry[]): Entry[] {
  let previous = ZERO_HASH;
  return rows.map((row, index) => {
    const numbered = { ...row, sequenceNo: index + 1 };
    const hashed = {
      ...numbered,
      previousHash: previous,
      entryHash: entryHash(previous, numbered),
    };
    previous = hashed.entryHash;
    return hashed;
  });
}

/**
 * A history of one issuance: units created in the treasury, then allocations, transfers,
 * blocks, unblocks and redemptions, each one only when the units are available, as the ledger
 * writer requires. The positions are kept by a separate, deliberately simple model.
 */
function history(seed: number) {
  const random = seededRandom(seed);
  const totalUnits = random.integer(1, 5_000);
  const held = new Map<string, number>([[TREASURY, 0]]);
  const blocked = new Map<string, number>([[TREASURY, 0]]);
  for (const investor of INVESTORS) {
    held.set(investor, 0);
    blocked.set(investor, 0);
  }
  const available = (account: string) => held.get(account)! - blocked.get(account)!;
  const rows: HashedEntry[] = [];
  const write = (
    type: LedgerEntryType,
    source: string | null,
    destination: string | null,
    quantity: number,
  ) => {
    rows.push({
      issuanceId: `issuance-${seed}`,
      sequenceNo: 0,
      type,
      sourceAccountId: source,
      destinationAccountId: destination,
      quantity: String(quantity),
      effectiveDate: '2026-11-06',
      recordedAt: new Date(Date.UTC(2026, 10, 6, 9, 0, rows.length)),
      businessReference: `operation:${rows.length}`,
      reversesEntryId: null,
      initiatedByUserId: 'admin',
      initiatedByService: null,
      metadata: { step: String(rows.length) },
      correlationId: null,
    });
  };
  write('ISSUANCE', null, TREASURY, totalUnits);
  held.set(TREASURY, totalUnits);

  const steps = random.integer(5, 60);
  for (let step = 0; step < steps; step += 1) {
    const kind = random.pick(['ALLOCATION', 'TRANSFER', 'BLOCK', 'UNBLOCK', 'REDEMPTION'] as const);
    const investor = random.pick(INVESTORS);
    if (kind === 'ALLOCATION' && available(TREASURY) > 0) {
      const quantity = random.integer(1, available(TREASURY));
      write('ALLOCATION', TREASURY, investor, quantity);
      held.set(TREASURY, held.get(TREASURY)! - quantity);
      held.set(investor, held.get(investor)! + quantity);
    } else if (kind === 'TRANSFER' && available(investor) > 0) {
      const recipient = random.pick(INVESTORS.filter((other) => other !== investor));
      const quantity = random.integer(1, available(investor));
      write('TRANSFER', investor, recipient, quantity);
      held.set(investor, held.get(investor)! - quantity);
      held.set(recipient, held.get(recipient)! + quantity);
    } else if (kind === 'BLOCK' && available(investor) > 0) {
      const quantity = random.integer(1, available(investor));
      write('BLOCK', investor, investor, quantity);
      blocked.set(investor, blocked.get(investor)! + quantity);
    } else if (kind === 'UNBLOCK' && blocked.get(investor)! > 0) {
      const quantity = random.integer(1, blocked.get(investor)!);
      write('UNBLOCK', investor, investor, quantity);
      blocked.set(investor, blocked.get(investor)! - quantity);
    } else if (kind === 'REDEMPTION' && available(investor) > 0) {
      const quantity = random.integer(1, available(investor));
      write('REDEMPTION', investor, null, quantity);
      held.set(investor, held.get(investor)! - quantity);
    }
  }
  const positions = [...held.keys()].map((accountId) => ({
    accountId,
    held: `${held.get(accountId)}.0000`,
    blocked: `${blocked.get(accountId)}.0000`,
  }));
  return { random, totalUnits: String(totalUnits), positions, entries: chained(rows) };
}

function breaches(registry: ReturnType<typeof history>, entries: readonly Entry[]) {
  return checkInvariants({
    totalUnits: registry.totalUnits,
    treasuryAccountId: TREASURY,
    positions: registry.positions,
    entries,
    hash: entryHash,
  });
}

describe('ledger histories (SPEC §10.4, generated)', () => {
  const seeds = Array.from({ length: HISTORIES }, (_, index) => index + 1);

  it('meet every invariant when written movement by movement', () => {
    for (const seed of seeds) {
      const registry = history(seed);
      expect(breaches(registry, registry.entries), `seed ${seed}`).toEqual([]);
    }
  });

  it('show a changed quantity at the changed entry, and in the positions', () => {
    for (const seed of seeds) {
      const registry = history(seed);
      const index = registry.random.integer(0, registry.entries.length - 1);
      const entries = registry.entries.map((row, position) =>
        position === index
          ? { ...row, quantity: parseDecimal(row.quantity).plus(1).toString() }
          : row,
      );
      const found = breaches(registry, entries);
      expect(found, `seed ${seed}`).toContainEqual({
        invariant: 5,
        sequenceNo: index + 1,
        detail: 'HASH_MISMATCH',
      });
      expect(
        found.some((breach) => breach.invariant === 2),
        `seed ${seed}`,
      ).toBe(true);
    }
  });

  it('show a changed date, author, reference or link even when the units still add up', () => {
    const changes: ((row: Entry) => Entry)[] = [
      (row) => ({ ...row, effectiveDate: '2026-11-07' }),
      (row) => ({ ...row, initiatedByUserId: 'someone-else' }),
      (row) => ({ ...row, businessReference: `${row.businessReference}-edited` }),
      (row) => ({ ...row, recordedAt: new Date(row.recordedAt.getTime() + 1) }),
      (row) => ({ ...row, metadata: { ...row.metadata, note: 'added' } }),
      (row) => ({ ...row, correlationId: 'another-request' }),
      (row) => ({ ...row, reversesEntryId: 'another-entry' }),
    ];
    for (const seed of seeds) {
      const registry = history(seed);
      const index = registry.random.integer(0, registry.entries.length - 1);
      const change = registry.random.pick(changes);
      const entries = registry.entries.map((row, position) =>
        position === index ? change(row) : row,
      );
      expect(breaches(registry, entries), `seed ${seed}`).toEqual([
        { invariant: 5, sequenceNo: index + 1, detail: 'HASH_MISMATCH' },
      ]);
    }
  });

  it('show a removed entry and two swapped entries', () => {
    for (const seed of seeds) {
      const registry = history(seed);
      if (registry.entries.length < 3) continue;
      const index = registry.random.integer(1, registry.entries.length - 2);
      const removed = registry.entries.filter((_, position) => position !== index);
      expect(
        breaches(registry, removed).some((breach) => breach.detail === 'SEQUENCE_GAP'),
        `seed ${seed}`,
      ).toBe(true);
      const swapped = [...registry.entries];
      [swapped[index], swapped[index + 1]] = [swapped[index + 1]!, swapped[index]!];
      expect(
        breaches(registry, swapped).some((breach) => breach.detail === 'HASH_MISMATCH'),
        `seed ${seed}`,
      ).toBe(true);
    }
  });

  // Limit of a hash chain kept in the same database: whoever can rewrite every entry and
  // recompute every hash produces a chain that checks out. Publishing the last hash outside the
  // database (docs/AUDIT.md, finding A-2) is what would reveal it.
  it('cannot reveal a history rewritten in full with recomputed hashes', () => {
    const registry = history(42);
    const rewritten = chained(
      registry.entries.map((row) => ({ ...row, businessReference: `${row.businessReference}-x` })),
    );
    expect(breaches(registry, rewritten)).toEqual([]);
  });
});
