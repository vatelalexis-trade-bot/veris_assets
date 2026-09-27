import { Inject, Injectable } from '@nestjs/common';
import { parseDecimal } from '@veris/shared';
import { and, eq } from 'drizzle-orm';
import { DATABASE, type Database, withTenantTransaction } from '../../../core/database/database.js';
import { AppError } from '../../../core/errors/app-error.js';
import type {
  TokenBalance,
  TokenRegistryProvider,
  TokenScope,
  TokenTransaction,
} from '../../../core/providers/token-registry-provider.js';
import { LedgerWriter, type PostEntry } from '../application/ledger-writer.js';
import { ledgerEntry, position } from './schema.js';

/**
 * The only `TokenRegistryProvider` of the MVP (SPEC §26): each operation is one movement written
 * by the LedgerWriter, in its own transaction of the issuance's tenant, with the same checks and
 * the same serialisation as every registry write.
 */
@Injectable()
export class InternalLedgerProvider implements TokenRegistryProvider {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly ledger: LedgerWriter,
  ) {}

  createAsset(scope: TokenScope, currency: string) {
    return withTenantTransaction(this.db, scope.tenantId, async (tx) => {
      await this.ledger.lock(tx, scope.tenantId, scope.issuanceId);
      const treasuryAccountId = await this.ledger.account(
        tx,
        scope.tenantId,
        scope.issuanceId,
        null,
        currency,
      );
      return { assetId: scope.issuanceId, treasuryAccountId };
    });
  }

  mint(scope: TokenScope, accountId: string, quantity: string, reference: string) {
    return this.post(scope, {
      type: 'ISSUANCE',
      sourceAccountId: null,
      destinationAccountId: accountId,
      quantity,
      businessReference: reference,
    });
  }

  transfer(
    scope: TokenScope,
    fromAccountId: string,
    toAccountId: string,
    quantity: string,
    reference: string,
  ) {
    return this.post(scope, {
      type: 'TRANSFER',
      sourceAccountId: fromAccountId,
      destinationAccountId: toAccountId,
      quantity,
      businessReference: reference,
    });
  }

  burn(scope: TokenScope, accountId: string, quantity: string, reference: string) {
    return this.post(scope, {
      type: 'REDEMPTION',
      sourceAccountId: accountId,
      destinationAccountId: null,
      quantity,
      businessReference: reference,
    });
  }

  freeze(scope: TokenScope, accountId: string, quantity: string, reference: string) {
    return this.post(scope, {
      type: 'BLOCK',
      sourceAccountId: accountId,
      destinationAccountId: accountId,
      quantity,
      businessReference: reference,
    });
  }

  unfreeze(scope: TokenScope, accountId: string, quantity: string, reference: string) {
    return this.post(scope, {
      type: 'UNBLOCK',
      sourceAccountId: accountId,
      destinationAccountId: accountId,
      quantity,
      businessReference: reference,
    });
  }

  getBalance(scope: TokenScope, accountId: string): Promise<TokenBalance> {
    return withTenantTransaction(this.db, scope.tenantId, async (tx) => {
      const [row] = await tx
        .select()
        .from(position)
        .where(and(eq(position.accountId, accountId), eq(position.issuanceId, scope.issuanceId)));
      if (!row) throw new AppError('RESOURCE_NOT_FOUND');
      const units = (value: string) => parseDecimal(value).toString();
      return {
        held: units(row.quantityHeld),
        blocked: units(row.quantityBlocked),
        available: units(row.quantityAvailable),
      };
    });
  }

  getTransactionStatus(scope: TokenScope, transactionId: string) {
    return withTenantTransaction(this.db, scope.tenantId, async (tx) => {
      const [row] = await tx
        .select({ status: ledgerEntry.status })
        .from(ledgerEntry)
        .where(
          and(eq(ledgerEntry.id, transactionId), eq(ledgerEntry.issuanceId, scope.issuanceId)),
        );
      return row ? ('POSTED' as const) : ('UNKNOWN' as const);
    });
  }

  private post(scope: TokenScope, entry: PostEntry): Promise<TokenTransaction> {
    return withTenantTransaction(this.db, scope.tenantId, async (tx) => {
      const [written] = await this.ledger.post(tx, scope.tenantId, scope.issuanceId, [entry]);
      return { transactionId: written!.id, status: 'POSTED' as const };
    });
  }
}
