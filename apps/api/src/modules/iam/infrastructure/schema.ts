// Tables of the iam module (docs/DATA_MODEL.md §3.2). Users, roles and permissions arrive in
// phases 5 and 6.
import { sql } from 'drizzle-orm';
import { char, check, pgSchema, text, uuid } from 'drizzle-orm/pg-core';
import { auditColumns, id } from '../../../core/database/columns.js';
import { country, currency } from '../../../core/database/schema.js';

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
