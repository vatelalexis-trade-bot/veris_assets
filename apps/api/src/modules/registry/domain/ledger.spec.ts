import { checkTransition } from '@veris/shared';
import { describe, expect, it } from 'vitest';
import { allocationAmount, allocationRoundMachine, checkAllocation } from './allocation.js';
import { correctionMachine, correctionRefusal, counterEntry } from './correction.js';
import { entryHash } from '../application/ledger-hash.js';
import {
  checkInvariants,
  positionDeltas,
  replay,
  ZERO_HASH,
  type HashedEntry,
  type LedgerEntryType,
} from './ledger.js';

const TREASURY = 'treasury';
const ALPINE = 'alpine';
const BALTIC = 'baltic';

function entry(
  sequenceNo: number,
  type: LedgerEntryType,
  source: string | null,
  destination: string | null,
  quantity: string,
): HashedEntry {
  return {
    issuanceId: 'issuance',
    sequenceNo,
    type,
    sourceAccountId: source,
    destinationAccountId: destination,
    quantity,
    effectiveDate: '2026-11-06',
    recordedAt: new Date('2026-11-06T09:00:00.000Z'),
    businessReference: 'allocation-round:1',
    reversesEntryId: null,
    initiatedByUserId: 'admin',
    initiatedByService: null,
    metadata: {},
    correlationId: null,
  };
}

/** Scenario 3: 1 000 units created, 600 and 400 allocated then blocked until payment (D-009). */
function chain() {
  const raw = [
    entry(1, 'ISSUANCE', null, TREASURY, '1000'),
    entry(2, 'ALLOCATION', TREASURY, ALPINE, '600'),
    entry(3, 'BLOCK', ALPINE, ALPINE, '600'),
    entry(4, 'ALLOCATION', TREASURY, BALTIC, '400'),
    entry(5, 'BLOCK', BALTIC, BALTIC, '400'),
  ];
  let previous = ZERO_HASH;
  return raw.map((row) => {
    const hashed = { ...row, previousHash: previous, entryHash: entryHash(previous, row) };
    previous = hashed.entryHash;
    return hashed;
  });
}

const positions = [
  { accountId: TREASURY, held: '0.0000', blocked: '0.0000' },
  { accountId: ALPINE, held: '600.0000', blocked: '600.0000' },
  { accountId: BALTIC, held: '400.0000', blocked: '400.0000' },
];

describe('ledger movements (docs/ARCHITECTURE.md §4.6)', () => {
  it('move held units from the source to the destination', () => {
    const deltas = positionDeltas(entry(2, 'ALLOCATION', TREASURY, ALPINE, '600'));
    expect(deltas.map((delta) => [delta.accountId, delta.held.toString()])).toEqual([
      [TREASURY, '-600'],
      [ALPINE, '600'],
    ]);
  });

  it('block and unblock units of one account without changing what it holds', () => {
    const [block] = positionDeltas(entry(3, 'BLOCK', ALPINE, ALPINE, '600'));
    const [unblock] = positionDeltas(entry(6, 'UNBLOCK', ALPINE, ALPINE, '600'));
    expect([block!.held.toString(), block!.blocked.toString()]).toEqual(['0', '600']);
    expect([unblock!.held.toString(), unblock!.blocked.toString()]).toEqual(['0', '-600']);
  });

  it('rebuild the positions from the movements', () => {
    const holdings = replay(chain());
    expect(holdings.get(TREASURY)!.held.toString()).toBe('0');
    expect(holdings.get(ALPINE)!.held.toString()).toBe('600');
    expect(holdings.get(BALTIC)!.blocked.toString()).toBe('400');
  });
});

describe('chained hash (SPEC §10.4, invariant 5)', () => {
  it('does not depend on how the database formats the quantity', () => {
    const a = entry(1, 'ISSUANCE', null, TREASURY, '1000');
    expect(entryHash(ZERO_HASH, a)).toBe(entryHash(ZERO_HASH, { ...a, quantity: '1000.0000' }));
    expect(entryHash(ZERO_HASH, a)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes with any protected field and with the previous hash', () => {
    const a = entry(1, 'ISSUANCE', null, TREASURY, '1000');
    const reference = entryHash(ZERO_HASH, a);
    expect(entryHash(ZERO_HASH, { ...a, quantity: '1001' })).not.toBe(reference);
    expect(entryHash(ZERO_HASH, { ...a, metadata: { round: '2' } })).not.toBe(reference);
    expect(entryHash('f'.repeat(64), a)).not.toBe(reference);
  });

  it('sorts the metadata keys', () => {
    const a = entry(1, 'ISSUANCE', null, TREASURY, '1000');
    expect(entryHash(ZERO_HASH, { ...a, metadata: { a: '1', b: '2' } })).toBe(
      entryHash(ZERO_HASH, { ...a, metadata: { b: '2', a: '1' } }),
    );
  });
});

describe('registry invariants (SPEC §10.4)', () => {
  const base = {
    totalUnits: '1000',
    treasuryAccountId: TREASURY,
    positions,
    entries: chain(),
    hash: entryHash,
  };

  it('are met by a consistent registry', () => {
    expect(checkInvariants(base)).toEqual([]);
  });

  it('detect a position that differs from the ledger (invariant 2)', () => {
    const changed = positions.map((row) =>
      row.accountId === BALTIC ? { ...row, held: '399', blocked: '399' } : row,
    );
    expect(checkInvariants({ ...base, positions: changed })).toEqual([
      { invariant: 2, accountId: BALTIC, detail: 'POSITION_DIFFERS_FROM_LEDGER' },
    ]);
  });

  it('detect blocked units above held ones (invariant 1)', () => {
    const changed = positions.map((row) =>
      row.accountId === ALPINE ? { ...row, blocked: '700' } : row,
    );
    expect(checkInvariants({ ...base, positions: changed })).toContainEqual({
      invariant: 1,
      accountId: ALPINE,
      detail: 'BLOCKED_ABOVE_HELD',
    });
  });

  it('detect investors holding more than the issuance (invariant 3)', () => {
    expect(checkInvariants({ ...base, totalUnits: '900' })).toContainEqual({
      invariant: 3,
      detail: 'ALLOCATED_ABOVE_TOTAL_UNITS',
    });
  });

  it('detect an altered movement and a missing one (invariant 5)', () => {
    const entries = chain();
    const altered = entries.map((row) =>
      row.sequenceNo === 4 ? { ...row, quantity: '399' } : row,
    );
    expect(
      checkInvariants({ ...base, entries: altered }).filter((breach) => breach.invariant === 5),
    ).toEqual([{ invariant: 5, sequenceNo: 4, detail: 'HASH_MISMATCH' }]);
    const gap = entries.filter((row) => row.sequenceNo !== 2);
    expect(checkInvariants({ ...base, entries: gap })).toContainEqual({
      invariant: 5,
      sequenceNo: 3,
      detail: 'SEQUENCE_GAP',
    });
  });
});

describe('allocation rounds (SPEC §10.1, D-013)', () => {
  const round = {
    totalUnits: '1000',
    nominalValue: '1000.00',
    minimumAmount: '500000.00',
    minimumWaiverJustification: null,
  };
  const lines = [
    { subscriptionId: 's1', requestedUnits: '500', allocatedUnits: '400' },
    { subscriptionId: 's2', requestedUnits: '400', allocatedUnits: '350' },
    { subscriptionId: 's3', requestedUnits: '300', allocatedUnits: '250' },
  ];

  it('accepts a total equal to the issuance units (scenario 3)', () => {
    expect(checkAllocation({ ...round, lines })).toEqual([]);
  });

  it('refuses one unit above the supply', () => {
    const over = lines.map((line) =>
      line.subscriptionId === 's3' ? { ...line, allocatedUnits: '251' } : line,
    );
    expect(checkAllocation({ ...round, lines: over })).toEqual([
      {
        code: 'ALLOCATION_EXCEEDS_SUPPLY',
        meta: { totalUnits: '1000', allocatedUnits: '1001' },
      },
    ]);
  });

  it('refuses more than requested, and fractions of units', () => {
    expect(
      checkAllocation({
        ...round,
        lines: [
          { subscriptionId: 's1', requestedUnits: '500', allocatedUnits: '501' },
          { subscriptionId: 's2', requestedUnits: '400', allocatedUnits: '1.5' },
        ],
      }).map((failure) => failure.code),
    ).toEqual(['ALLOCATION_EXCEEDS_REQUEST', 'QUANTITY_NOT_INTEGER']);
  });

  it('asks a justification below the minimum amount (D-013)', () => {
    const small = [{ subscriptionId: 's1', requestedUnits: '500', allocatedUnits: '100' }];
    expect(checkAllocation({ ...round, lines: small })).toEqual([
      {
        code: 'MINIMUM_NOT_REACHED_JUSTIFICATION_REQUIRED',
        meta: { minimumAmount: '500000.00', allocatedAmount: '100000' },
      },
    ]);
    expect(
      checkAllocation({ ...round, lines: small, minimumWaiverJustification: 'Anchor investor' }),
    ).toEqual([]);
  });

  it('computes amounts exactly', () => {
    expect(allocationAmount('333', '1000.01')).toBe('333003.33');
  });

  it('is validated by another user than the preparer (four eyes)', () => {
    const admin = { userId: 'admin', permissions: new Set(['allocation:validate']) };
    const request = { from: 'PROPOSED', to: 'VALIDATED', actor: admin } as const;
    expect(checkTransition(allocationRoundMachine, { ...request, initiatorUserId: 'admin' })).toBe(
      'FOUR_EYES_VIOLATION',
    );
    expect(
      checkTransition(allocationRoundMachine, { ...request, initiatorUserId: 'operator' }),
    ).toBeNull();
  });
});

describe('corrections (SPEC §10.3)', () => {
  const allocationEntry = {
    type: 'ALLOCATION' as const,
    sourceAccountId: TREASURY,
    destinationAccountId: ALPINE,
    quantity: '600',
  };
  const base = {
    target: allocationEntry,
    alreadyReversed: false,
    pendingRequest: false,
    replacements: [],
    accountsOfIssuance: new Set([TREASURY, ALPINE, BALTIC]),
  };

  it('reverse the target: the same units back from the destination to the source', () => {
    expect(counterEntry(allocationEntry)).toEqual({
      sourceAccountId: ALPINE,
      destinationAccountId: TREASURY,
      quantity: '600',
    });
    // Replaying the ledger with the counter-entry and a replacement gives the corrected holdings.
    const holdings = replay([
      ...chain(),
      { type: 'CORRECTION', ...counterEntry(allocationEntry) },
      {
        type: 'CORRECTION',
        sourceAccountId: TREASURY,
        destinationAccountId: BALTIC,
        quantity: '600',
      },
    ]);
    expect(holdings.get(ALPINE)!.held.toString()).toBe('0');
    expect(holdings.get(BALTIC)!.held.toString()).toBe('1000');
  });

  it('refuse blocking movements, entries already corrected or with a pending request', () => {
    expect(correctionRefusal(base)).toBeNull();
    expect(correctionRefusal({ ...base, target: { ...allocationEntry, type: 'BLOCK' } })).toBe(
      'CORRECTION_NOT_SUPPORTED_FOR_TYPE',
    );
    expect(correctionRefusal({ ...base, alreadyReversed: true })).toBe('ALREADY_CORRECTED');
    expect(correctionRefusal({ ...base, pendingRequest: true })).toBe('CORRECTION_PENDING');
  });

  it('check the replacement movements', () => {
    const line = { sourceAccountId: TREASURY, destinationAccountId: BALTIC, quantity: '10' };
    expect(correctionRefusal({ ...base, replacements: [line] })).toBeNull();
    expect(
      correctionRefusal({
        ...base,
        replacements: [{ ...line, destinationAccountId: 'elsewhere' }],
      }),
    ).toBe('ACCOUNT_NOT_OF_ISSUANCE');
    expect(
      correctionRefusal({
        ...base,
        replacements: [{ sourceAccountId: null, destinationAccountId: null, quantity: '1' }],
      }),
    ).toBe('REPLACEMENT_WITHOUT_ACCOUNT');
    expect(correctionRefusal({ ...base, replacements: [{ ...line, quantity: '0.5' }] })).toBe(
      'QUANTITY_NOT_INTEGER',
    );
  });

  it('are decided by someone else than the requester (four eyes)', () => {
    const officer = { userId: 'officer', permissions: new Set(['registry-correction:approve']) };
    expect(
      checkTransition(correctionMachine, {
        from: 'PROPOSED',
        to: 'APPROVED',
        actor: officer,
        initiatorUserId: 'officer',
      }),
    ).toBe('FOUR_EYES_VIOLATION');
  });
});
