// Tables of the reporting-audit module (docs/DATA_MODEL.md §3.8): the requests of CSV exports.
// The schema `reporting` and its views are created by hand (drizzle/0026_reporting_views.sql).
import { sql } from 'drizzle-orm';
import { check, index, integer, jsonb, pgSchema, text, uuid } from 'drizzle-orm/pg-core';
import { id, tenantId, utcTimestamp } from '../../../core/database/columns.js';
import { document } from '../../../core/database/schema.js';
import { tenant } from '../../iam/index.js';

export const reportingSchema = pgSchema('reporting');

/** A CSV export, generated in the background and kept as a REPORT document (SPEC §18, P15-3). */
export const exportRequest = reportingSchema.table(
  'export_request',
  {
    id: id(),
    tenantId: tenantId().references(() => tenant.id),
    requestedBy: uuid().notNull(),
    kind: text().notNull(),
    /** Filters of the export, e.g. `{ "issuanceId": "…" }`. */
    params: jsonb().notNull().default({}),
    status: text().notNull().default('QUEUED'),
    documentId: uuid().references(() => document.id),
    rowCount: integer(),
    error: text(),
    createdAt: utcTimestamp().notNull().defaultNow(),
    finishedAt: utcTimestamp(),
  },
  (table) => [
    check(
      'export_request_kind',
      sql`${table.kind} IN ('REGISTRY', 'SUBSCRIPTIONS', 'DISTRIBUTIONS', 'AUDIT')`,
    ),
    check('export_request_status', sql`${table.status} IN ('QUEUED', 'RUNNING', 'DONE', 'FAILED')`),
    index('export_request_requester').on(table.tenantId, table.requestedBy, table.createdAt),
  ],
);
