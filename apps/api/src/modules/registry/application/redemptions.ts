import { Injectable } from '@nestjs/common';
import { parseDecimal } from '@veris/shared';
import { eq } from 'drizzle-orm';
import type { Transaction } from '../../../core/database/database.js';
import { AppError } from '../../../core/errors/app-error.js';
import { position } from '../infrastructure/schema.js';
import { LedgerWriter, type PostEntry } from './ledger-writer.js';
import type { SnapshotLine } from './snapshots.js';

/**
 * Repayment of the principal (SPEC §12.6, docs/DATA_MODEL.md §4.5): REDEMPTION movements bring
 * every position of the issuance to zero, the treasury's unsold units included. Refused while
 * units are blocked (a transfer under review) or when the investors' holdings changed since the
 * record date the repayment was calculated on.
 */
@Injectable()
export class RegistryRedemptions {
  constructor(private readonly ledger: LedgerWriter) {}

  /** The checks alone, before anything is paid. */
  async check(
    tx: Transaction,
    tenantId: string,
    issuanceId: string,
    snapshotLines: readonly SnapshotLine[],
  ): Promise<void> {
    await this.ledger.lock(tx, tenantId, issuanceId);
    const positions = await this.positionsOf(tx, issuanceId);
    const expected = new Map(snapshotLines.map((line) => [line.accountId, line.quantityHeld]));
    const investors = positions.filter((row) => row.investorId !== null);
    if (investors.some((row) => parseDecimal(row.quantityBlocked).gt(0))) {
      throw new AppError('INVALID_STATE_TRANSITION', [{ code: 'UNITS_BLOCKED', field: null }]);
    }
    const changed = investors.some((row) => {
      const held = parseDecimal(row.quantityHeld);
      const recorded = expected.get(row.accountId);
      return recorded === undefined ? held.gt(0) : !held.eq(parseDecimal(recorded));
    });
    if (changed) {
      throw new AppError('INVALID_STATE_TRANSITION', [
        { code: 'HOLDINGS_CHANGED_SINCE_RECORD_DATE', field: null },
      ]);
    }
  }

  /** Every position to zero, in the caller's transaction; the invariants are checked. */
  async redeemAll(
    tx: Transaction,
    tenantId: string,
    issuanceId: string,
    snapshotLines: readonly SnapshotLine[],
    totalUnits: string | null,
    businessReference: string,
  ): Promise<void> {
    await this.check(tx, tenantId, issuanceId, snapshotLines);
    const entries: PostEntry[] = (await this.positionsOf(tx, issuanceId))
      .filter((row) => parseDecimal(row.quantityHeld).gt(0))
      .map((row) => ({
        type: 'REDEMPTION',
        sourceAccountId: row.accountId,
        destinationAccountId: null,
        quantity: parseDecimal(row.quantityHeld).toString(),
        // The amount invested leaves with the units.
        amount: parseDecimal(row.acquisitionAmount).toString(),
        businessReference,
        metadata: { reason: 'PRINCIPAL_REPAYMENT' },
      }));
    if (entries.length > 0) await this.ledger.post(tx, tenantId, issuanceId, entries);
    await this.ledger.assertConsistent(tx, issuanceId, totalUnits);
  }

  private positionsOf(tx: Transaction, issuanceId: string) {
    return tx
      .select({
        accountId: position.accountId,
        investorId: position.investorId,
        quantityHeld: position.quantityHeld,
        quantityBlocked: position.quantityBlocked,
        acquisitionAmount: position.acquisitionAmount,
      })
      .from(position)
      .where(eq(position.issuanceId, issuanceId))
      .for('update');
  }
}
