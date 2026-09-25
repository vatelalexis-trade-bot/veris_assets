// Tables of the iam module (docs/DATA_MODEL.md §3.2). Permissions arrive in phase 6.
import { sql } from 'drizzle-orm';
import {
  boolean,
  char,
  check,
  index,
  integer,
  pgSchema,
  primaryKey,
  text,
  uuid,
} from 'drizzle-orm/pg-core';
import { auditColumns, id, utcTimestamp } from '../../../core/database/columns.js';
import { country, currency } from '../../../core/database/schema.js';
import { ROLE_CODES } from '../domain/roles.js';

export const iamSchema = pgSchema('iam');

/** A tenant is an organisation (SPEC §20). Row level security: a session only sees its own tenant. */
export const tenant = iamSchema.table(
  'tenant',
  {
    id: id(),
    legalName: text().notNull(),
    tradeName: text(),
    countryCode: char({ length: 2 })
      .notNull()
      .references(() => country.code),
    baseCurrency: char({ length: 3 })
      .notNull()
      .references(() => currency.code),
    defaultLocale: text().notNull().default('en-GB'),
    timezone: text().notNull().default('Europe/Paris'),
    organizationType: text().notNull(),
    status: text().notNull().default('ACTIVE'),
    logoDocumentId: uuid(),
    ...auditColumns(),
  },
  (table) => [
    check('tenant_status', sql`${table.status} IN ('ACTIVE', 'INACTIVE')`),
    check('tenant_default_locale', sql`${table.defaultLocale} IN ('en-GB', 'fr-FR')`),
    check(
      'tenant_organization_type',
      sql`${table.organizationType} IN ('ISSUER', 'ASSET_MANAGER', 'FUND')`,
    ),
  ],
);

// ---------------------------------------------------------------------------------------------
// Identity tables used by Better Auth (decision D-002). Column names follow what Better Auth
// expects; Virtus Assets fields are added after them. Only the va_auth role reads and writes the
// session, account, verification and two_factor tables (decision D-030).
// ---------------------------------------------------------------------------------------------

export const user = iamSchema.table(
  'user',
  {
    id: id(),
    name: text().notNull(),
    // Always stored in lower case, unique across the platform.
    email: text().notNull().unique(),
    emailVerified: boolean().notNull().default(false),
    image: text(),
    createdAt: utcTimestamp().notNull().defaultNow(),
    updatedAt: utcTimestamp().notNull().defaultNow(),
    twoFactorEnabled: boolean().notNull().default(false),
    // Null for platform users, who belong to no tenant.
    tenantId: uuid().references(() => tenant.id),
    // Set for investor users once investors exist (phase 8).
    investorId: uuid(),
    status: text().notNull().default('ACTIVE'),
    locale: text().notNull().default('en-GB'),
    failedLoginCount: integer().notNull().default(0),
    lockedUntil: utcTimestamp(),
    lastLoginAt: utcTimestamp(),
  },
  (table) => [
    check('user_status', sql`${table.status} IN ('ACTIVE', 'INACTIVE')`),
    check('user_locale', sql`${table.locale} IN ('en-GB', 'fr-FR')`),
    check('user_email_lower_case', sql`${table.email} = lower(${table.email})`),
    index('user_tenant_idx').on(table.tenantId),
  ],
);

export const session = iamSchema.table(
  'session',
  {
    id: id(),
    expiresAt: utcTimestamp().notNull(),
    token: text().notNull().unique(),
    createdAt: utcTimestamp().notNull().defaultNow(),
    updatedAt: utcTimestamp().notNull().defaultNow(),
    ipAddress: text(),
    userAgent: text(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (table) => [index('session_user_idx').on(table.userId)],
);

/** Credentials. For email + password sign-in, `password` holds the Argon2id hash. */
export const account = iamSchema.table(
  'account',
  {
    id: id(),
    accountId: text().notNull(),
    providerId: text().notNull(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: utcTimestamp(),
    refreshTokenExpiresAt: utcTimestamp(),
    scope: text(),
    password: text(),
    createdAt: utcTimestamp().notNull().defaultNow(),
    updatedAt: utcTimestamp().notNull().defaultNow(),
  },
  (table) => [index('account_user_idx').on(table.userId)],
);

/** Short-lived tokens (password reset…), managed by Better Auth. */
export const verification = iamSchema.table(
  'verification',
  {
    id: id(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: utcTimestamp().notNull(),
    createdAt: utcTimestamp().notNull().defaultNow(),
    updatedAt: utcTimestamp().notNull().defaultNow(),
  },
  (table) => [index('verification_identifier_idx').on(table.identifier)],
);

/** TOTP secret and backup codes, encrypted by Better Auth with BETTER_AUTH_SECRET. */
export const twoFactor = iamSchema.table(
  'two_factor',
  {
    id: id(),
    secret: text().notNull(),
    backupCodes: text().notNull(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    verified: boolean().notNull().default(true),
    failedVerificationCount: integer().notNull().default(0),
    lockedUntil: utcTimestamp(),
  },
  (table) => [
    index('two_factor_user_idx').on(table.userId),
    index('two_factor_secret_idx').on(table.secret),
  ],
);

/** System roles of SPEC §4 (tenant-specific roles are out of the MVP). */
export const role = iamSchema.table(
  'role',
  {
    id: id(),
    code: text().notNull().unique(),
    isSystem: boolean().notNull().default(true),
  },
  (table) => [
    check(
      'role_code',
      sql`${table.code} IN (${sql.raw(ROLE_CODES.map((code) => `'${code}'`).join(', '))})`,
    ),
  ],
);

export const userRole = iamSchema.table(
  'user_role',
  {
    userId: uuid()
      .notNull()
      .references(() => user.id),
    roleId: uuid()
      .notNull()
      .references(() => role.id),
    // Same tenant as the user (null for platform users); needed by row level security.
    tenantId: uuid().references(() => tenant.id),
    grantedBy: uuid(),
    grantedAt: utcTimestamp().notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.roleId] })],
);

/** Invitation of a future user (SPEC §6.1). Only a hash of the token is stored. */
export const userInvitation = iamSchema.table(
  'user_invitation',
  {
    id: id(),
    tenantId: uuid().references(() => tenant.id),
    email: text().notNull(),
    name: text().notNull(),
    roleId: uuid()
      .notNull()
      .references(() => role.id),
    tokenHash: text().notNull().unique(),
    expiresAt: utcTimestamp().notNull(),
    acceptedAt: utcTimestamp(),
    invitedBy: uuid(),
    createdAt: utcTimestamp().notNull().defaultNow(),
  },
  (table) => [
    check('user_invitation_email_lower_case', sql`${table.email} = lower(${table.email})`),
  ],
);
