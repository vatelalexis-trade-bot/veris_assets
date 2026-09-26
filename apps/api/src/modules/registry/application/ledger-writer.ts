import { Inject, Injectable } from '@nestjs/common';
import { parseDecimal } from '@virtus/shared';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { getRequestContext } from '../../../core/context/request-context.js';
import {
  DATABASE,
  type Database,
  type Transaction,
  withTenantTransaction,
} from '../../../core/database/database.js';
import { AppError } from '../../../core/errors/app-error.js';
import { TenantDirectory } from '../../iam/index.js';
import {
  checkInvariants,
  positionDeltas,
  ZERO_HASH,
  type InvariantBreach,
  type LedgerEntryType,
} from '../domain/ledger.js';
import { ledgerEntry, ledgerHead, logicalAccount, position } from '../infrastructure/schema.js';
import { entryHash } from './ledger-hash.js';

export type LedgerEntryRow = typeof ledgerEntry.$inferSelect;

export interface PostEntry {
  type: LedgerEntryType;
  sourceAccountId: string | null;
  destinationAccountId: string | null;
  quantity: string;
  /** What the movement belongs to, e.g. `allocation-round:<id>` (SPEC §10.3). */
  businessReference: string;
  reversesEntryId?: string | null;
  /** Identifiers only, never personal data. */
  metadata?: Record<string, string>;
  /** Acquisition amount moved with the units (allocation, cancellation), on investor accounts. */
  amount?: string;
}

/**
 * The only writer of the registry (docs/ARCHITECTURE.md §4.6). In the caller's transaction, it
 * locks the issuance's ledger head (which serialises every write of that issuance), numbers and
 * chains the entries, and updates the positions with them. A movement that would take more units
 * than available is refused; the database constraints are the last safety net.
 */
@Injectable()
export class LedgerWriter {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly tenants: TenantDirectory,
  ) {}

  /** Locks the issuance's ledger, creating its head at the first write. */
  async lock(tx: Transaction, tenantId: string, issuanceId: string) {
    await tx
      .insert(ledgerHead)
      .values({ issuanceId, tenantId, lastSequence: 0, lastHash: ZERO_HASH })
      .onConflictDoNothing();
    const [head] = await tx
      .select()
      .from(ledgerHead)
      .where(eq(ledgerHead.issuanceId, issuanceId))
      .for('update');
    return head!;
  }

  /** The account of an investor (or the treasury when `investorId` is null), with its position. */
  async account(
    tx: Transaction,
    tenantId: string,
    issuanceId: string,
    investorId: string | null,
    currency: string,
  ): Promise<string> {
    const [created] = await tx
      .insert(logicalAccount)
      .values({
        tenantId,
        issuanceId,
        investorId,
        type: investorId ? 'INVESTOR' : 'ISSUER_TREASURY',
      })
      .onConflictDoNothing()
      .returning({ id: logicalAccount.id });
    if (created) {
      await tx
        .insert(position)
        .values({ tenantId, issuanceId, accountId: created.id, investorId, currency });
      return created.id;
    }
    const [existing] = await tx
      .select({ id: logicalAccount.id })
      .from(logicalAccount)
      .where(
        and(
          eq(logicalAccount.issuanceId, issuanceId),
          investorId
            ? eq(logicalAccount.investorId, investorId)
            : isNull(logicalAccount.investorId),
        ),
      );
    return existing!.id;
  }

  /** Writes the movements in order and updates the positions, in the caller's transaction. */
  async post(
    tx: Transaction,
    tenantId: string,
    issuanceId: string,
    entries: readonly PostEntry[],
  ): Promise<LedgerEntryRow[]> {
    const head = await this.lock(tx, tenantId, issuanceId);
    const context = getRequestContext();
    const effectiveDate = await this.tenants.todayOf(tx, tenantId);
    let sequence = head.lastSequence;
    let previousHash = head.lastHash;
    const written: LedgerEntryRow[] = [];
    for (const input of entries) {
      await this.applyToPositions(tx, input);
      sequence += 1;
      const values = {
        issuanceId,
        sequenceNo: sequence,
        type: input.type,
        sourceAccountId: input.sourceAccountId,
        destinationAccountId: input.destinationAccountId,
        quantity: parseDecimal(input.quantity).toString(),
        effectiveDate,
        // Milliseconds only, so that the value read back gives the same hash.
        recordedAt: new Date(),
        businessReference: input.businessReference,
        reversesEntryId: input.reversesEntryId ?? null,
        initiatedByUserId: context?.user?.userId ?? null,
        initiatedByService: context?.user ? null : 'registry',
        metadata: input.metadata ?? {},
        correlationId: context?.correlationId ?? null,
      };
      const hash = entryHash(previousHash, values);
      const [row] = await tx
        .insert(ledgerEntry)
        .values({ ...values, tenantId, previousHash, entryHash: hash })
        .returning();
      written.push(row!);
      previousHash = hash;
    }
    await tx
      .update(ledgerHead)
      .set({ lastSequence: sequence, lastHash: previousHash })
      .where(eq(ledgerHead.issuanceId, issuanceId));
    return written;
  }

  /** Invariants 1, 2, 3 and 5 of SPEC §10.4 for one issuance, from the database. */
  async breaches(
    tx: Transaction,
    issuanceId: string,
    totalUnits: string | null,
  ): Promise<InvariantBreach[]> {
    const positions = await tx
      .select({
        accountId: position.accountId,
        held: position.quantityHeld,
        blocked: position.quantityBlocked,
        investorId: position.investorId,
      })
      .from(position)
      .where(eq(position.issuanceId, issuanceId));
    const entries = await tx
      .select()
      .from(ledgerEntry)
      .where(eq(ledgerEntry.issuanceId, issuanceId))
      .orderBy(asc(ledgerEntry.sequenceNo));
    return checkInvariants({
      totalUnits,
      treasuryAccountId: positions.find((row) => row.investorId === null)?.accountId ?? null,
      positions,
      entries: entries.map((row) => ({ ...row, type: row.type as LedgerEntryType })),
      hash: entryHash,
    });
  }

  /** The invariants of one issuance, in a transaction of its tenant (reconciliation). */
  breachesFor(
    tenantId: string,
    issuanceId: string,
    totalUnits: string | null,
  ): Promise<InvariantBreach[]> {
    return withTenantTransaction(this.db, tenantId, (tx) =>
      this.breaches(tx, issuanceId, totalUnits),
    );
  }

  /** Refuses the transaction when the registry would be inconsistent (checked before commit). */
  async assertConsistent(
    tx: Transaction,
    issuanceId: string,
    totalUnits: string | null,
  ): Promise<void> {
    const found = await this.breaches(tx, issuanceId, totalUnits);
    if (found.length > 0) {
      throw new AppError(
        'REGISTRY_INVARIANT_VIOLATION',
        found.map((breach) => ({
          code: `INVARIANT_${breach.invariant}`,
          field: null,
          meta: { detail: breach.detail },
        })),
      );
    }
  }

  private async applyToPositions(tx: Transaction, input: PostEntry): Promise<void> {
    const zero = parseDecimal('0');
    for (const delta of positionDeltas(input)) {
      const [current] = await tx
        .select()
        .from(position)
        .where(eq(position.accountId, delta.accountId))
        .for('update');
      if (!current) throw new AppError('RESOURCE_NOT_FOUND');
      const held = parseDecimal(current.quantityHeld).plus(delta.held);
      const blocked = parseDecimal(current.quantityBlocked).plus(delta.blocked);
      // Taking held units needs them available (not blocked); blocking needs them held.
      if (held.lt(zero) || blocked.lt(zero) || blocked.gt(held)) {
        throw new AppError('INSUFFICIENT_AVAILABLE_QUANTITY', [
          {
            code: 'INSUFFICIENT_AVAILABLE_QUANTITY',
            field: null,
            meta: { available: current.quantityAvailable, requested: input.quantity },
          },
        ]);
      }
      const amount =
        input.amount && current.investorId
          ? delta.held.isNegative()
            ? parseDecimal(input.amount).neg()
            : delta.held.gt(0)
              ? parseDecimal(input.amount)
              : zero
          : zero;
      await tx
        .update(position)
        .set({
          quantityHeld: held.toString(),
          quantityBlocked: blocked.toString(),
          acquisitionAmount: parseDecimal(current.acquisitionAmount).plus(amount).toString(),
          version: sql`${position.version} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(position.id, current.id));
    }
  }
}
