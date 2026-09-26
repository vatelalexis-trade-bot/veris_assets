/**
 * Abstraction of a token registry (SPEC §26, docs/ARCHITECTURE.md §4.6): the operations a
 * blockchain would offer on an issuance's units. Only `InternalLedgerProvider` (over the internal
 * ledger, the MVP's source of truth) exists; `EthereumLikeProvider` (ERC-3643) or
 * `PolkadotAssetHubProvider` could implement it later, as a mirror reconciled daily. No blockchain
 * dependency is added in the MVP.
 *
 * Accounts are the logical accounts of the registry; quantities are decimal strings.
 */
export interface TokenScope {
  /** Organisation of the issuance, as determined by the server (never by a request). */
  tenantId: string;
  issuanceId: string;
}

export interface TokenTransaction {
  transactionId: string;
  status: 'POSTED';
}

export interface TokenBalance {
  held: string;
  blocked: string;
  available: string;
}

export interface TokenRegistryProvider {
  /** Prepares the asset of an issuance (for the internal ledger: its head and treasury account). */
  createAsset(
    scope: TokenScope,
    currency: string,
  ): Promise<{ assetId: string; treasuryAccountId: string }>;
  /** Creates units on an account (ISSUANCE). */
  mint(
    scope: TokenScope,
    accountId: string,
    quantity: string,
    reference: string,
  ): Promise<TokenTransaction>;
  /** Moves available units between two accounts (TRANSFER). */
  transfer(
    scope: TokenScope,
    fromAccountId: string,
    toAccountId: string,
    quantity: string,
    reference: string,
  ): Promise<TokenTransaction>;
  /** Removes available units (REDEMPTION). */
  burn(
    scope: TokenScope,
    accountId: string,
    quantity: string,
    reference: string,
  ): Promise<TokenTransaction>;
  /** Blocks available units of an account (BLOCK), e.g. while a transfer is reviewed. */
  freeze(
    scope: TokenScope,
    accountId: string,
    quantity: string,
    reference: string,
  ): Promise<TokenTransaction>;
  /** Releases blocked units (UNBLOCK). */
  unfreeze(
    scope: TokenScope,
    accountId: string,
    quantity: string,
    reference: string,
  ): Promise<TokenTransaction>;
  getBalance(scope: TokenScope, accountId: string): Promise<TokenBalance>;
  getTransactionStatus(
    scope: TokenScope,
    transactionId: string,
  ): Promise<TokenTransaction['status'] | 'UNKNOWN'>;
}

export const TOKEN_REGISTRY_PROVIDER = Symbol('TOKEN_REGISTRY_PROVIDER');
