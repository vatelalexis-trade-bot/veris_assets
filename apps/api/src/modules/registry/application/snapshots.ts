import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { parseDecimal, type BusinessDate } from '@virtus/shared';
import { and, asc, eq, lte } from 'drizzle-orm';
import type { Transaction } from '../../../core/database/database.js';
import { AppError } from '../../../core/errors/app-error.js';
import { replay, type LedgerEntryType } from '../domain/ledger.js';
import {
  ledgerEntry,
  logicalAccount,
  registrySnapshot,
  registrySnapshotLine,
} from '../infrastructure/schema.js';
import { LedgerWriter } from './ledger-writer.js';

export interface SnapshotLine {
  accountId: string;
  investorId: string;
  quantityHeld: string;
}

export interface Snapshot {
  id: string;
  issuanceId: string;
  recordDate: BusinessDate;
  lastSequenceIncluded: number;
  checksum: string;
  lines: SnapshotLine[];
}

/**
 * Snapshots of the registry at a record date (SPEC §12.3): the investors' holdings rebuilt from
 * the movements effective on or before that date (the issuer's treasury is never a holder). Kept
 * append-only; `verify` rebuilds one from the ledger and compares the checksums.
 */
@Injectable()
export class RegistrySnapshots {
  constructor(private readonly ledger: LedgerWriter) {}

  /** A new snapshot, in the caller's transaction; the issuance's ledger is locked meanwhile. */
  async take(
    tx: Transaction,
    tenantId: string,
    issuanceId: string,
    recordDate: BusinessDate,
  ): Promise<Snapshot> {
    const head = await this.ledger.lock(tx, tenantId, issuanceId);
    const built = await this.build(tx, issuanceId, recordDate, head.lastSequence);
    const [created] = await tx
      .insert(registrySnapshot)
      .values({
        tenantId,
        issuanceId,
        recordDate,
        lastSequenceIncluded: built.lastSequenceIncluded,
        checksum: built.checksum,
      })
      .returning();
    if (built.lines.length > 0) {
      await tx
        .insert(registrySnapshotLine)
        .values(built.lines.map((line) => ({ ...line, snapshotId: created!.id, tenantId })));
    }
    return { ...built, id: created!.id, issuanceId, recordDate };
  }

  async read(tx: Transaction, snapshotId: string): Promise<Snapshot> {
    const [snapshot] = await tx
      .select()
      .from(registrySnapshot)
      .where(eq(registrySnapshot.id, snapshotId));
    if (!snapshot) throw new AppError('RESOURCE_NOT_FOUND');
    const lines = await tx
      .select({
        accountId: registrySnapshotLine.accountId,
        investorId: registrySnapshotLine.investorId,
        quantityHeld: registrySnapshotLine.quantityHeld,
      })
      .from(registrySnapshotLine)
      .where(eq(registrySnapshotLine.snapshotId, snapshotId))
      .orderBy(asc(registrySnapshotLine.accountId));
    return {
      id: snapshot.id,
      issuanceId: snapshot.issuanceId,
      recordDate: snapshot.recordDate,
      lastSequenceIncluded: snapshot.lastSequenceIncluded,
      checksum: snapshot.checksum,
      lines: lines.map((line) => ({
        ...line,
        quantityHeld: parseDecimal(line.quantityHeld).toString(),
      })),
    };
  }

  /** Whether the ledger still gives exactly the stored snapshot (reproducibility, §12.3). */
  async verify(tx: Transaction, snapshotId: string): Promise<boolean> {
    const stored = await this.read(tx, snapshotId);
    const rebuilt = await this.build(
      tx,
      stored.issuanceId,
      stored.recordDate,
      stored.lastSequenceIncluded,
    );
    return rebuilt.checksum === stored.checksum && checksumOf(stored) === stored.checksum;
  }

  private async build(
    tx: Transaction,
    issuanceId: string,
    recordDate: BusinessDate,
    upToSequence: number,
  ) {
    const entries = await tx
      .select()
      .from(ledgerEntry)
      .where(
        and(
          eq(ledgerEntry.issuanceId, issuanceId),
          lte(ledgerEntry.effectiveDate, recordDate),
          lte(ledgerEntry.sequenceNo, upToSequence),
        ),
      )
      .orderBy(asc(ledgerEntry.sequenceNo));
    const investors = new Map(
      (
        await tx
          .select({ id: logicalAccount.id, investorId: logicalAccount.investorId })
          .from(logicalAccount)
          .where(eq(logicalAccount.issuanceId, issuanceId))
      )
        .filter((account) => account.investorId !== null)
        .map((account) => [account.id, account.investorId!]),
    );
    const holdings = replay(entries.map((row) => ({ ...row, type: row.type as LedgerEntryType })));
    const lines = [...holdings.entries()]
      .filter(([accountId, holding]) => investors.has(accountId) && holding.held.gt(0))
      .map(([accountId, holding]) => ({
        accountId,
        investorId: investors.get(accountId)!,
        quantityHeld: holding.held.toString(),
      }))
      .sort((a, b) => (a.accountId < b.accountId ? -1 : 1));
    const lastSequenceIncluded = entries.at(-1)?.sequenceNo ?? 0;
    return {
      lines,
      lastSequenceIncluded,
      checksum: checksumOf({ recordDate, lastSequenceIncluded, lines }),
    };
  }
}

/** Checksum of a snapshot, also used by the demonstration data (scripts/db/seed-registry.ts). */
export function checksumOf(snapshot: {
  recordDate: BusinessDate;
  lastSequenceIncluded: number;
  lines: readonly SnapshotLine[];
}): string {
  const canonical = JSON.stringify([
    snapshot.recordDate,
    snapshot.lastSequenceIncluded,
    [...snapshot.lines]
      .sort((a, b) => (a.accountId < b.accountId ? -1 : 1))
      .map((line) => [line.accountId, line.investorId, parseDecimal(line.quantityHeld).toString()]),
  ]);
  return createHash('sha256').update(canonical).digest('hex');
}
