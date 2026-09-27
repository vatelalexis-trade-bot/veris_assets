// Tables of the technical core (docs/DATA_MODEL.md §3.1). Business modules define their own
// tables in modules/<name>/infrastructure/schema.ts.
import { sql } from 'drizzle-orm';
import {
  boolean,
  char,
  check,
  index,
  inet,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  smallint,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { auditColumns, id, tenantId, utcTimestamp } from './columns.js';

export const coreSchema = pgSchema('core');
export const auditSchema = pgSchema('audit');

// Reference data (global, read-only for the API)

export const country = coreSchema.table('country', {
  code: char({ length: 2 }).primaryKey(),
  nameEn: text().notNull(),
  nameFr: text().notNull(),
});

export const currency = coreSchema.table(
  'currency',
  {
    code: char({ length: 3 }).primaryKey(),
    minorUnits: smallint().notNull(),
  },
  (table) => [check('currency_minor_units_range', sql`${table.minorUnits} BETWEEN 0 AND 4`)],
);

export const referenceData = coreSchema.table(
  'reference_data',
  {
    id: id(),
    category: text().notNull(),
    code: text().notNull(),
    labelEn: text().notNull(),
    labelFr: text().notNull(),
    active: boolean().notNull().default(true),
  },
  (table) => [unique('reference_data_category_code').on(table.category, table.code)],
);

// Technical tables (tenant-scoped, row level security)

export const idempotencyKey = coreSchema.table(
  'idempotency_key',
  {
    id: id(),
    // Null for platform actions, which have no tenant.
    tenantId: uuid(),
    userId: uuid().notNull(),
    key: uuid().notNull(),
    method: text().notNull(),
    path: text().notNull(),
    requestHash: text().notNull(),
    status: text().notNull(),
    responseStatus: integer(),
    responseBody: jsonb(),
    createdAt: utcTimestamp().notNull().defaultNow(),
    expiresAt: utcTimestamp().notNull(),
  },
  (table) => [
    unique('idempotency_key_user_key').on(table.userId, table.key),
    check('idempotency_key_status', sql`${table.status} IN ('IN_PROGRESS', 'COMPLETED')`),
    index('idempotency_key_expires_at').on(table.expiresAt),
  ],
);

/** Business events written in the transaction of the operation (outbox pattern, SPEC §15). */
export const outboxEvent = coreSchema.table(
  'outbox_event',
  {
    id: id(),
    tenantId: tenantId(),
    eventType: text().notNull(),
    aggregateType: text().notNull(),
    aggregateId: uuid().notNull(),
    // Identifiers only, never personal data (SPEC §8.5).
    payload: jsonb().notNull(),
    correlationId: uuid(),
    occurredAt: utcTimestamp().notNull().defaultNow(),
    processedAt: utcTimestamp(),
    attempts: integer().notNull().default(0),
    lastError: text(),
  },
  (table) => [
    index('outbox_event_pending')
      .on(table.tenantId, table.occurredAt)
      .where(sql`${table.processedAt} IS NULL`),
  ],
);

/** Every state machine transition (SPEC §7). Append-only. */
export const workflowTransition = coreSchema.table('workflow_transition', {
  id: id(),
  tenantId: tenantId(),
  resourceType: text().notNull(),
  resourceId: uuid().notNull(),
  fromStatus: text(),
  toStatus: text().notNull(),
  // Null when the transition is made by the system (job).
  actorUserId: uuid(),
  actorRole: text(),
  comment: text(),
  correlationId: uuid(),
  occurredAt: utcTimestamp().notNull().defaultNow(),
});

/** Audit log (SPEC §17.2). Append-only; sensitive values are masked before being written. */
export const auditEvent = auditSchema.table(
  'audit_event',
  {
    id: id(),
    // Null for purely platform-level events.
    tenantId: uuid(),
    occurredAt: utcTimestamp().notNull().defaultNow(),
    actorUserId: uuid(),
    actorRole: text(),
    action: text().notNull(),
    resourceType: text(),
    resourceId: uuid(),
    oldValue: jsonb(),
    newValue: jsonb(),
    source: text().notNull(),
    ipAddress: inet(),
    userAgent: text(),
    correlationId: uuid(),
    result: text().notNull(),
    reason: text(),
  },
  (table) => [
    check('audit_event_source', sql`${table.source} IN ('WEB', 'API', 'JOB', 'SYSTEM')`),
    check('audit_event_result', sql`${table.result} IN ('SUCCESS', 'DENIED', 'FAILED')`),
    index('audit_event_tenant_occurred_at').on(table.tenantId, table.occurredAt),
  ],
);

// Notifications (SPEC §15)

/** In-app notification of one user. Texts come from the catalogue of @veris/shared. */
export const notification = coreSchema.table(
  'notification',
  {
    id: id(),
    // Null for platform users, who have no tenant.
    tenantId: uuid(),
    userId: uuid().notNull(),
    category: text().notNull(),
    /** Business event that caused it, e.g. `iam.user.roles-changed`. */
    eventType: text().notNull(),
    /** Notification type of the catalogue (title and body), e.g. `ROLES_CHANGED`. */
    titleKey: text().notNull(),
    /** Placeholder values: identifiers and codes only, never personal data. */
    params: jsonb().notNull().default({}),
    resourceType: text(),
    resourceId: uuid(),
    /** Outbox event that created it: delivering an event twice creates one notification only. */
    sourceEventId: uuid(),
    readAt: utcTimestamp(),
    createdAt: utcTimestamp().notNull().defaultNow(),
  },
  (table) => [
    unique('notification_source_event_user').on(table.sourceEventId, table.userId),
    index('notification_user_created_at').on(table.userId, table.createdAt),
  ],
);

/** Channels chosen by a user for one category; mandatory categories are forced by the code. */
export const notificationPreference = coreSchema.table(
  'notification_preference',
  {
    tenantId: uuid(),
    userId: uuid().notNull(),
    category: text().notNull(),
    inApp: boolean().notNull(),
    email: boolean().notNull(),
    updatedAt: utcTimestamp().notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.category] })],
);

// Documents (SPEC §16). The file itself is in the S3-compatible storage; these tables hold the
// metadata. Business modules link documents to their resources (e.g. investor.kyc_document).

export const document = coreSchema.table(
  'document',
  {
    id: id(),
    tenantId: tenantId(),
    type: text().notNull(),
    name: text().notNull(),
    confidentiality: text().notNull(),
    /** What the document belongs to: `INVESTOR`, `ISSUANCE` or `TENANT`. */
    ownerType: text().notNull(),
    issuanceId: uuid(),
    investorId: uuid(),
    status: text().notNull().default('ACTIVE'),
    currentVersion: integer().notNull().default(1),
    expiresAt: utcTimestamp(),
    ...auditColumns(),
  },
  (table) => [
    check('document_status', sql`${table.status} IN ('ACTIVE', 'ARCHIVED')`),
    check(
      'document_confidentiality',
      sql`${table.confidentiality} IN ('INVESTOR_VISIBLE', 'INTERNAL', 'CONFIDENTIAL')`,
    ),
    check('document_owner_type', sql`${table.ownerType} IN ('INVESTOR', 'ISSUANCE', 'TENANT')`),
    index('document_tenant_investor').on(table.tenantId, table.investorId),
  ],
);

/** Every uploaded version of a document. Append-only: a new file is a new version. */
export const documentVersion = coreSchema.table(
  'document_version',
  {
    id: id(),
    tenantId: tenantId(),
    documentId: uuid()
      .notNull()
      .references(() => document.id),
    version: integer().notNull(),
    /** `tenants/{tenantId}/documents/{documentId}/v{version}` (docs/ARCHITECTURE.md §4.11). */
    storageKey: text().notNull(),
    /** Detected from the content, never taken from the file name. */
    mimeType: text().notNull(),
    sizeBytes: integer().notNull(),
    checksumSha256: char({ length: 64 }).notNull(),
    scanStatus: text().notNull(),
    fileName: text().notNull(),
    /** Null for the documents the platform generates itself (notices, exports). */
    uploadedBy: uuid(),
    uploadedAt: utcTimestamp().notNull().defaultNow(),
  },
  (table) => [
    unique('document_version_number').on(table.documentId, table.version),
    check('document_version_scan_status', sql`${table.scanStatus} IN ('CLEAN', 'REJECTED')`),
    check('document_version_size', sql`${table.sizeBytes} > 0`),
  ],
);
