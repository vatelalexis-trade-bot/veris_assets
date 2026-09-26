import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, inArray, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { currentUser } from '../../../core/context/request-context.js';
import {
  DATABASE,
  type Database,
  type Transaction,
  withCurrentTenant,
} from '../../../core/database/database.js';
import { AppError } from '../../../core/errors/app-error.js';
import { offsetOf, type Page, type Pagination } from '../../../core/http/pagination.js';
import { investor } from '../../investor-compliance/index.js';
import { issuance } from '../../issuance/index.js';
import { ledgerEntry, logicalAccount, position } from '../infrastructure/schema.js';

export type PositionRow = typeof position.$inferSelect & {
  issuanceName: string;
  issuanceCode: string;
  investorName: string | null;
  accountType: string;
};

export interface AccountSide {
  accountId: string | null;
  type: string | null;
  investorId: string | null;
  /** Hidden from an investor when the account is another investor's. */
  investorName: string | null;
}

export type LedgerEntryView = typeof ledgerEntry.$inferSelect & {
  issuanceCode: string;
  source: AccountSide;
  destination: AccountSide;
};

const sourceAccount = alias(logicalAccount, 'source_account');
const destinationAccount = alias(logicalAccount, 'destination_account');
const sourceInvestor = alias(investor, 'source_investor');
const destinationInvestor = alias(investor, 'destination_investor');

/**
 * Reading the registry (SPEC §10.2, §10.3): positions and movements. An investor only sees its own
 * positions and the movements of its own accounts, without the names of other investors.
 */
@Injectable()
export class RegistryQueries {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  private ownInvestor(): string | null | undefined {
    const user = currentUser();
    if (user.permissions.get('registry:read') !== 'own') return undefined;
    return user.investorId;
  }

  async positions(
    filters: { issuanceId?: string; investorId?: string },
    pagination: Pagination,
  ): Promise<Page<PositionRow>> {
    const own = this.ownInvestor();
    const conditions = [
      own === undefined ? undefined : own ? eq(position.investorId, own) : sql`false`,
      filters.issuanceId ? eq(position.issuanceId, filters.issuanceId) : undefined,
      filters.investorId ? eq(position.investorId, filters.investorId) : undefined,
    ].filter((condition): condition is SQL => condition !== undefined);
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    return withCurrentTenant(this.db, async (tx) => {
      const [{ total } = { total: 0 }] = await tx
        .select({ total: count() })
        .from(position)
        .where(where);
      const rows = await this.positionQuery(tx)
        .where(where)
        .orderBy(
          asc(issuance.code),
          // The treasury first, then the investors by name.
          sql`${position.investorId} IS NOT NULL`,
          asc(investor.legalName),
        )
        .limit(pagination.pageSize)
        .offset(offsetOf(pagination));
      return { data: rows.map(flattenPosition), meta: { ...pagination, total } };
    });
  }

  position(id: string): Promise<PositionRow> {
    const own = this.ownInvestor();
    return withCurrentTenant(this.db, async (tx) => {
      const [row] = await this.positionQuery(tx).where(
        and(
          eq(position.id, id),
          own === undefined ? undefined : own ? eq(position.investorId, own) : sql`false`,
        ),
      );
      if (!row) throw new AppError('RESOURCE_NOT_FOUND');
      return flattenPosition(row);
    });
  }

  async entries(
    filters: { issuanceId?: string; type?: string },
    pagination: Pagination,
  ): Promise<Page<LedgerEntryView>> {
    const own = this.ownInvestor();
    return withCurrentTenant(this.db, async (tx) => {
      const scope = own === undefined ? undefined : await this.ownAccountsCondition(tx, own);
      const conditions = [
        scope,
        filters.issuanceId ? eq(ledgerEntry.issuanceId, filters.issuanceId) : undefined,
        filters.type ? eq(ledgerEntry.type, filters.type) : undefined,
      ].filter((condition): condition is SQL => condition !== undefined);
      const where = conditions.length > 0 ? and(...conditions) : undefined;
      const [{ total } = { total: 0 }] = await tx
        .select({ total: count() })
        .from(ledgerEntry)
        .where(where);
      const rows = await this.entryQuery(tx)
        .where(where)
        .orderBy(desc(ledgerEntry.recordedAt), desc(ledgerEntry.sequenceNo))
        .limit(pagination.pageSize)
        .offset(offsetOf(pagination));
      return {
        data: rows.map((row) => this.toEntryView(row, own)),
        meta: { ...pagination, total },
      };
    });
  }

  entry(id: string): Promise<LedgerEntryView> {
    const own = this.ownInvestor();
    return withCurrentTenant(this.db, async (tx) => {
      const scope = own === undefined ? undefined : await this.ownAccountsCondition(tx, own);
      const [row] = await this.entryQuery(tx).where(and(eq(ledgerEntry.id, id), scope));
      if (!row) throw new AppError('RESOURCE_NOT_FOUND');
      return this.toEntryView(row, own);
    });
  }

  /** Legal names of investors, for the other modules (servicing lines, payment instructions). */
  async investorNames(tx: Transaction, ids: readonly string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const rows = await tx
      .select({ id: investor.id, name: investor.legalName })
      .from(investor)
      .where(inArray(investor.id, [...ids]));
    return new Map(rows.map((row) => [row.id, row.name]));
  }

  /** Movements touching one of the investor's accounts. */
  private async ownAccountsCondition(tx: Transaction, own: string | null): Promise<SQL> {
    if (!own) return sql`false`;
    const accounts = (
      await tx
        .select({ id: logicalAccount.id })
        .from(logicalAccount)
        .where(eq(logicalAccount.investorId, own))
    ).map((row) => row.id);
    if (accounts.length === 0) return sql`false`;
    return or(
      inArray(ledgerEntry.sourceAccountId, accounts),
      inArray(ledgerEntry.destinationAccountId, accounts),
    )!;
  }

  private positionQuery(tx: Transaction) {
    return tx
      .select({
        position,
        issuanceName: issuance.name,
        issuanceCode: issuance.code,
        investorName: investor.legalName,
        accountType: logicalAccount.type,
      })
      .from(position)
      .innerJoin(issuance, eq(issuance.id, position.issuanceId))
      .innerJoin(logicalAccount, eq(logicalAccount.id, position.accountId))
      .leftJoin(investor, eq(investor.id, position.investorId));
  }

  private entryQuery(tx: Transaction) {
    return tx
      .select({
        entry: ledgerEntry,
        issuanceCode: issuance.code,
        sourceType: sourceAccount.type,
        sourceInvestorId: sourceAccount.investorId,
        sourceInvestorName: sourceInvestor.legalName,
        destinationType: destinationAccount.type,
        destinationInvestorId: destinationAccount.investorId,
        destinationInvestorName: destinationInvestor.legalName,
      })
      .from(ledgerEntry)
      .innerJoin(issuance, eq(issuance.id, ledgerEntry.issuanceId))
      .leftJoin(sourceAccount, eq(sourceAccount.id, ledgerEntry.sourceAccountId))
      .leftJoin(sourceInvestor, eq(sourceInvestor.id, sourceAccount.investorId))
      .leftJoin(destinationAccount, eq(destinationAccount.id, ledgerEntry.destinationAccountId))
      .leftJoin(destinationInvestor, eq(destinationInvestor.id, destinationAccount.investorId));
  }

  private toEntryView(
    row: Awaited<ReturnType<RegistryQueries['entryQuery']>>[number],
    own: string | null | undefined,
  ): LedgerEntryView {
    // An investor sees its own name, never another investor's (D-010).
    const visible = (investorId: string | null, name: string | null) =>
      own === undefined || investorId === own ? name : null;
    return {
      ...row.entry,
      issuanceCode: row.issuanceCode,
      source: {
        accountId: row.entry.sourceAccountId,
        type: row.sourceType,
        investorId: own === undefined || row.sourceInvestorId === own ? row.sourceInvestorId : null,
        investorName: visible(row.sourceInvestorId, row.sourceInvestorName),
      },
      destination: {
        accountId: row.entry.destinationAccountId,
        type: row.destinationType,
        investorId:
          own === undefined || row.destinationInvestorId === own ? row.destinationInvestorId : null,
        investorName: visible(row.destinationInvestorId, row.destinationInvestorName),
      },
    };
  }
}

function flattenPosition(row: {
  position: typeof position.$inferSelect;
  issuanceName: string;
  issuanceCode: string;
  investorName: string | null;
  accountType: string;
}): PositionRow {
  return {
    ...row.position,
    issuanceName: row.issuanceName,
    issuanceCode: row.issuanceCode,
    investorName: row.investorName,
    accountType: row.accountType,
  };
}
