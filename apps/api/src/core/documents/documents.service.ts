import { createHash, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { DocumentConfidentiality, DocumentMimeType, DocumentType } from '@veris/shared';
import { and, count, desc, eq, ne, sql, type SQL } from 'drizzle-orm';
import { AuditWriter } from '../audit/audit-writer.js';
import { ENV, type Env } from '../config/env.js';
import { currentUser, getRequestContext, type RequestUser } from '../context/request-context.js';
import {
  DATABASE,
  type Database,
  type Transaction,
  withTenantTransaction,
} from '../database/database.js';
import { document, documentVersion } from '../database/schema.js';
import { AppError } from '../errors/app-error.js';
import { offsetOf, type Page, type Pagination } from '../http/pagination.js';
import { Outbox } from '../outbox/outbox.js';
import { CircuitBreaker } from '../providers/circuit-breaker.js';
import { DOCUMENT_STORAGE, type DocumentStorageProvider } from '../providers/document-storage.js';
import { FILE_SCANNER, type FileScanner } from '../providers/file-scanner.js';
import { DownloadTokens, type DownloadGrant } from './download-token.js';
import { detectDocumentType } from './file-type.js';

export type DocumentRow = typeof document.$inferSelect;
export type DocumentVersionRow = typeof documentVersion.$inferSelect;
export type DocumentWithVersion = DocumentRow & { current: DocumentVersionRow };

export interface UploadedFile {
  originalname: string;
  buffer: Buffer;
  size: number;
}

export interface NewDocument {
  type: DocumentType;
  name: string;
  confidentiality: DocumentConfidentiality;
  ownerType: 'INVESTOR' | 'ISSUANCE' | 'TENANT';
  investorId?: string | null;
  issuanceId?: string | null;
}

export interface DocumentFilters {
  investorId?: string;
  type?: DocumentType;
  status?: 'ACTIVE' | 'ARCHIVED';
}

/** Checks that the resource a document is attached to exists in the tenant (given by its module). */
export type OwnerCheck = (tx: Transaction, id: string) => Promise<boolean>;

/** Business event of a new document, handled by the modules (e.g. notify the investor). */
export const DOCUMENT_ADDED_EVENT = 'core.document.added';

/** Documents an investor may give (SPEC §4.5): its own documents and its KYC evidence. */
const INVESTOR_DOCUMENT_TYPES: readonly DocumentType[] = ['INVESTOR_DOCUMENT', 'KYC_EVIDENCE'];

/** Longest file name kept (the name is only shown and used for the downloaded file). */
const MAX_FILE_NAME_LENGTH = 200;

function cleanFileName(name: string): string {
  // Only the last path segment, without control characters.
  const last = name.split(/[\\/]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex -- control characters are exactly what is removed
  const base = last.replace(/[\u0000-\u001F\u007F]/g, '').trim();
  return (base || 'document').slice(0, MAX_FILE_NAME_LENGTH);
}

/**
 * Documents (SPEC §16, docs/ARCHITECTURE.md §4.11): upload → size → real type → scan → checksum →
 * storage → metadata. Access by tenant (row level security) and by role: an investor only sees
 * its own non-internal documents; confidential ones need `document:read-confidential`.
 */
@Injectable()
export class DocumentsService {
  private readonly tokens: DownloadTokens;
  private readonly scanner = new CircuitBreaker();
  private readonly ownerChecks = new Map<string, OwnerCheck>();

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENV) env: Env,
    @Inject(DOCUMENT_STORAGE) private readonly storage: DocumentStorageProvider,
    @Inject(FILE_SCANNER) private readonly fileScanner: FileScanner,
    private readonly audit: AuditWriter,
    private readonly outbox: Outbox,
  ) {
    this.tokens = new DownloadTokens(env.BETTER_AUTH_SECRET);
  }

  /** Registered by the module that owns a kind of resource (the core never reads its tables). */
  useOwnerCheck(ownerType: NewDocument['ownerType'], check: OwnerCheck): void {
    this.ownerChecks.set(ownerType, check);
  }

  /** Conditions of the documents the user may see (also used by the modules that list documents). */
  visibleTo(user: RequestUser): SQL | undefined {
    const conditions: SQL[] = [];
    if (user.permissions.get('document:read') === 'own') {
      if (!user.investorId) return sql`false`;
      conditions.push(
        eq(document.investorId, user.investorId),
        ne(document.confidentiality, 'INTERNAL'),
      );
    }
    if (!user.permissions.has('document:read-confidential')) {
      conditions.push(ne(document.confidentiality, 'CONFIDENTIAL'));
    }
    return conditions.length > 0 ? and(...conditions) : undefined;
  }

  private tenantOf(user: RequestUser): string {
    if (!user.tenantId) throw new AppError('PERMISSION_DENIED');
    return user.tenantId;
  }

  async list(filters: DocumentFilters, pagination: Pagination): Promise<Page<DocumentWithVersion>> {
    const user = currentUser();
    const conditions = [
      this.visibleTo(user),
      eq(document.status, filters.status ?? 'ACTIVE'),
      filters.investorId ? eq(document.investorId, filters.investorId) : undefined,
      filters.type ? eq(document.type, filters.type) : undefined,
    ].filter((condition): condition is SQL => condition !== undefined);
    return withTenantTransaction(this.db, this.tenantOf(user), async (tx) => {
      const where = and(...conditions);
      const [{ total } = { total: 0 }] = await tx
        .select({ total: count() })
        .from(document)
        .where(where);
      const rows = await tx
        .select({ document, current: documentVersion })
        .from(document)
        .innerJoin(
          documentVersion,
          and(
            eq(documentVersion.documentId, document.id),
            eq(documentVersion.version, document.currentVersion),
          ),
        )
        .where(where)
        .orderBy(desc(document.createdAt), desc(document.id))
        .limit(pagination.pageSize)
        .offset(offsetOf(pagination));
      return {
        data: rows.map((row) => ({ ...row.document, current: row.current })),
        meta: { ...pagination, total },
      };
    });
  }

  /** One document the user may see, with its versions (newest first). */
  async get(id: string): Promise<DocumentWithVersion & { versions: DocumentVersionRow[] }> {
    const user = currentUser();
    return withTenantTransaction(this.db, this.tenantOf(user), async (tx) => {
      const found = await this.findVisible(tx, user, id);
      const versions = await tx
        .select()
        .from(documentVersion)
        .where(eq(documentVersion.documentId, id))
        .orderBy(desc(documentVersion.version));
      return { ...found, current: versions[0]!, versions };
    });
  }

  /** In the caller's transaction: a visible document, or 404 (never "forbidden"). */
  async findVisible(tx: Transaction, user: RequestUser, id: string): Promise<DocumentRow> {
    const [found] = await tx
      .select()
      .from(document)
      .where(and(eq(document.id, id), this.visibleTo(user)));
    if (!found) throw new AppError('RESOURCE_NOT_FOUND');
    return found;
  }

  async upload(file: UploadedFile | undefined, request: NewDocument): Promise<DocumentWithVersion> {
    const user = currentUser();
    const tenantId = this.tenantOf(user);
    const target = this.restrictForInvestor(user, request);
    const checked = await this.checkFile(file, tenantId, { type: target.type, name: target.name });
    const documentId = randomUUID();
    const storageKey = `tenants/${tenantId}/documents/${documentId}/v1`;
    // The file is stored first: if the metadata cannot be written, an unused file remains in the
    // storage, but no document ever points to a missing file.
    await this.storage.put(storageKey, checked.content, checked.mimeType);

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      if (target.investorId) await this.checkOwner(tx, 'INVESTOR', target.investorId);
      if (target.issuanceId) await this.checkOwner(tx, 'ISSUANCE', target.issuanceId);
      const [created] = await tx
        .insert(document)
        .values({
          id: documentId,
          tenantId,
          type: target.type,
          name: target.name,
          confidentiality: target.confidentiality,
          ownerType: target.ownerType,
          investorId: target.investorId ?? null,
          issuanceId: target.issuanceId ?? null,
          createdBy: user.userId,
        })
        .returning();
      const current = await this.insertVersion(tx, created!, 1, storageKey, checked, user);
      await this.audit.recordIn(tx, {
        tenantId,
        action: 'DOCUMENT_UPLOADED',
        resourceType: 'document',
        resourceId: documentId,
        newValue: {
          type: target.type,
          confidentiality: target.confidentiality,
          investorId: target.investorId ?? null,
          mimeType: checked.mimeType,
          sizeBytes: checked.content.length,
          checksumSha256: checked.checksum,
        },
        result: 'SUCCESS',
      });
      await this.publishAdded(tx, created!, user);
      return { ...created!, current };
    });
  }

  /**
   * A document generated by the platform (subscription form, allocation confirmation, coupon
   * notice, export), in the caller's transaction and tenant. Its content is ours: no type
   * detection nor scan. Returns the existing one when the same document was already generated
   * (events are delivered at least once).
   */
  async storeGenerated(
    tx: Transaction,
    tenantId: string,
    request: NewDocument & { content: Buffer; mimeType: 'application/pdf' | 'text/csv' },
  ): Promise<DocumentRow> {
    const [existing] = await tx
      .select()
      .from(document)
      .where(
        and(
          eq(document.type, request.type),
          eq(document.name, request.name),
          request.investorId ? eq(document.investorId, request.investorId) : sql`true`,
        ),
      );
    if (existing) return existing;
    const documentId = randomUUID();
    const storageKey = `tenants/${tenantId}/documents/${documentId}/v1`;
    await this.storage.put(storageKey, request.content, request.mimeType);
    const actor = getRequestContext()?.user?.userId ?? null;
    const [created] = await tx
      .insert(document)
      .values({
        id: documentId,
        tenantId,
        type: request.type,
        name: request.name,
        confidentiality: request.confidentiality,
        ownerType: request.ownerType,
        investorId: request.investorId ?? null,
        issuanceId: request.issuanceId ?? null,
        createdBy: actor,
      })
      .returning();
    await tx.insert(documentVersion).values({
      tenantId,
      documentId,
      version: 1,
      storageKey,
      mimeType: request.mimeType,
      sizeBytes: request.content.length,
      checksumSha256: createHash('sha256').update(request.content).digest('hex'),
      scanStatus: 'CLEAN',
      fileName: cleanFileName(request.name),
      uploadedBy: actor,
    });
    await this.audit.recordIn(tx, {
      tenantId,
      action: 'DOCUMENT_GENERATED',
      resourceType: 'document',
      resourceId: documentId,
      newValue: {
        type: request.type,
        investorId: request.investorId ?? null,
        sizeBytes: request.content.length,
      },
      result: 'SUCCESS',
    });
    if (created!.investorId && created!.confidentiality !== 'INTERNAL') {
      await this.outbox.publish(tx, {
        tenantId,
        eventType: DOCUMENT_ADDED_EVENT,
        aggregateType: 'document',
        aggregateId: documentId,
        payload: { investorId: created!.investorId, type: created!.type },
      });
    }
    return created!;
  }

  async addVersion(id: string, file: UploadedFile | undefined): Promise<DocumentWithVersion> {
    const user = currentUser();
    const tenantId = this.tenantOf(user);
    const existing = await withTenantTransaction(this.db, tenantId, (tx) =>
      this.findVisible(tx, user, id),
    );
    this.checkWritable(user, existing);
    const checked = await this.checkFile(file, tenantId, existing);
    const version = existing.currentVersion + 1;
    const storageKey = `tenants/${tenantId}/documents/${id}/v${version}`;
    await this.storage.put(storageKey, checked.content, checked.mimeType);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [updated] = await tx
        .update(document)
        .set({
          currentVersion: version,
          version: sql`${document.version} + 1`,
          updatedAt: new Date(),
        })
        // Two uploads at the same time: only the first one wins, the other gets a conflict.
        .where(and(eq(document.id, id), eq(document.currentVersion, existing.currentVersion)))
        .returning();
      if (!updated) throw new AppError('VERSION_CONFLICT');
      const current = await this.insertVersion(tx, updated, version, storageKey, checked, user);
      await this.audit.recordIn(tx, {
        tenantId,
        action: 'DOCUMENT_VERSION_ADDED',
        resourceType: 'document',
        resourceId: id,
        oldValue: { version: existing.currentVersion },
        newValue: { version, mimeType: checked.mimeType, checksumSha256: checked.checksum },
        result: 'SUCCESS',
      });
      await this.publishAdded(tx, updated, user);
      return { ...updated, current };
    });
  }

  async archive(id: string): Promise<DocumentRow> {
    const user = currentUser();
    const tenantId = this.tenantOf(user);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const existing = await this.findVisible(tx, user, id);
      this.checkWritable(user, existing);
      if (existing.status === 'ARCHIVED') throw new AppError('INVALID_STATE_TRANSITION');
      const [updated] = await tx
        .update(document)
        .set({ status: 'ARCHIVED', version: sql`${document.version} + 1`, updatedAt: new Date() })
        .where(eq(document.id, id))
        .returning();
      await this.audit.recordIn(tx, {
        tenantId,
        action: 'DOCUMENT_ARCHIVED',
        resourceType: 'document',
        resourceId: id,
        oldValue: { status: 'ACTIVE' },
        newValue: { status: 'ARCHIVED' },
        result: 'SUCCESS',
      });
      return updated!;
    });
  }

  /** A download link valid 5 minutes, for the current version or a given one. */
  async downloadLink(id: string, version?: number): Promise<{ url: string; expiresAt: Date }> {
    const user = currentUser();
    const tenantId = this.tenantOf(user);
    const existing = await withTenantTransaction(this.db, tenantId, (tx) =>
      this.findVisible(tx, user, id),
    );
    const wanted = version ?? existing.currentVersion;
    if (wanted < 1 || wanted > existing.currentVersion) throw new AppError('RESOURCE_NOT_FOUND');
    const { token, expiresAt } = this.tokens.issue({
      documentId: id,
      version: wanted,
      tenantId,
      userId: user.userId,
    });
    return { url: `/api/v1/documents/download?token=${encodeURIComponent(token)}`, expiresAt };
  }

  /**
   * The file of a download link. The link only works for the user it was made for, and the
   * rights are checked again. Downloads of confidential documents are audited (SPEC §16).
   */
  async download(token: string): Promise<{ content: Buffer; version: DocumentVersionRow }> {
    const user = currentUser();
    const grant: DownloadGrant | null = this.tokens.verify(token);
    if (!grant || grant.userId !== user.userId || grant.tenantId !== user.tenantId) {
      throw new AppError('RESOURCE_NOT_FOUND');
    }
    const { found, version } = await withTenantTransaction(this.db, grant.tenantId, async (tx) => {
      const visible = await this.findVisible(tx, user, grant.documentId);
      const [row] = await tx
        .select()
        .from(documentVersion)
        .where(
          and(
            eq(documentVersion.documentId, grant.documentId),
            eq(documentVersion.version, grant.version),
          ),
        );
      if (!row) throw new AppError('RESOURCE_NOT_FOUND');
      return { found: visible, version: row };
    });
    const content = await this.storage.get(version.storageKey);
    if (found.confidentiality === 'CONFIDENTIAL') {
      await this.audit.record({
        tenantId: grant.tenantId,
        action: 'DOCUMENT_DOWNLOADED',
        resourceType: 'document',
        resourceId: found.id,
        newValue: { version: version.version },
        result: 'SUCCESS',
      });
    }
    return { content, version };
  }

  /** An investor may only give its own documents, of the kinds it is allowed to give. */
  private restrictForInvestor(user: RequestUser, request: NewDocument): NewDocument {
    if (user.permissions.get('document:upload') !== 'own') return request;
    if (!user.investorId || !INVESTOR_DOCUMENT_TYPES.includes(request.type)) {
      throw new AppError('PERMISSION_DENIED');
    }
    return {
      type: request.type,
      name: request.name,
      ownerType: 'INVESTOR',
      investorId: user.investorId,
      issuanceId: null,
      // KYC evidence stays confidential; the investor keeps seeing its own documents.
      confidentiality: request.type === 'KYC_EVIDENCE' ? 'CONFIDENTIAL' : 'INVESTOR_VISIBLE',
    };
  }

  private checkWritable(user: RequestUser, existing: DocumentRow): void {
    if (
      user.permissions.get('document:upload') === 'own' &&
      (existing.investorId !== user.investorId ||
        !INVESTOR_DOCUMENT_TYPES.includes(existing.type as DocumentType))
    ) {
      throw new AppError('PERMISSION_DENIED');
    }
  }

  private async checkOwner(tx: Transaction, ownerType: NewDocument['ownerType'], id: string) {
    const check = this.ownerChecks.get(ownerType);
    if (!check || !(await check(tx, id))) {
      throw new AppError('VALIDATION_FAILED', [
        { code: 'UNKNOWN_OWNER', field: ownerType === 'INVESTOR' ? 'investorId' : 'issuanceId' },
      ]);
    }
  }

  /** Size, real type and antivirus scan; a rejected file is audited and never stored. */
  private async checkFile(
    file: UploadedFile | undefined,
    tenantId: string,
    context: { type: string; name: string },
  ): Promise<{ content: Buffer; mimeType: DocumentMimeType; checksum: string; fileName: string }> {
    if (!file || file.size === 0) {
      throw new AppError('VALIDATION_FAILED', [{ code: 'FILE_REQUIRED', field: 'file' }]);
    }
    const mimeType = await detectDocumentType(file.buffer);
    if (!mimeType)
      throw new AppError('FILE_TYPE_NOT_ALLOWED', [{ code: 'TYPE_NOT_ALLOWED', field: 'file' }]);
    const verdict = await this.scanner.call(() => this.fileScanner.scan(file.buffer));
    if (verdict === 'REJECTED') {
      await this.audit.record({
        tenantId,
        action: 'DOCUMENT_REJECTED',
        resourceType: 'document',
        newValue: { type: context.type, mimeType },
        result: 'FAILED',
        reason: 'FILE_REJECTED_BY_SCAN',
      });
      throw new AppError('FILE_REJECTED_BY_SCAN');
    }
    return {
      content: file.buffer,
      mimeType,
      checksum: createHash('sha256').update(file.buffer).digest('hex'),
      fileName: cleanFileName(file.originalname),
    };
  }

  private async insertVersion(
    tx: Transaction,
    row: DocumentRow,
    version: number,
    storageKey: string,
    checked: { content: Buffer; mimeType: string; checksum: string; fileName: string },
    user: RequestUser,
  ): Promise<DocumentVersionRow> {
    const [created] = await tx
      .insert(documentVersion)
      .values({
        tenantId: row.tenantId,
        documentId: row.id,
        version,
        storageKey,
        mimeType: checked.mimeType,
        sizeBytes: checked.content.length,
        checksumSha256: checked.checksum,
        scanStatus: 'CLEAN',
        fileName: checked.fileName,
        uploadedBy: user.userId,
      })
      .returning();
    return created!;
  }

  /** Staff adding a document an investor can see: the investor is told (SPEC §15). */
  private async publishAdded(tx: Transaction, row: DocumentRow, user: RequestUser): Promise<void> {
    if (
      user.permissions.get('document:upload') === 'own' ||
      !row.investorId ||
      row.confidentiality === 'INTERNAL'
    ) {
      return;
    }
    await this.outbox.publish(tx, {
      tenantId: row.tenantId,
      eventType: DOCUMENT_ADDED_EVENT,
      aggregateType: 'document',
      aggregateId: row.id,
      payload: { investorId: row.investorId, type: row.type },
    });
  }
}
