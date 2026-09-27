import { Inject, Injectable } from '@nestjs/common';
import type { KycCaseStatus } from '@veris/shared';
import { and, asc, count, desc, eq, type SQL } from 'drizzle-orm';
import { AuditWriter } from '../../../core/audit/audit-writer.js';
import { currentUser, type RequestUser } from '../../../core/context/request-context.js';
import {
  DATABASE,
  type Database,
  type Transaction,
  withCurrentTenant,
} from '../../../core/database/database.js';
import { document } from '../../../core/database/schema.js';
import { DocumentsService } from '../../../core/documents/documents.service.js';
import { AppError } from '../../../core/errors/app-error.js';
import { offsetOf, type Page, type Pagination } from '../../../core/http/pagination.js';
import { Outbox } from '../../../core/outbox/outbox.js';
import { CircuitBreaker } from '../../../core/providers/circuit-breaker.js';
import { KYC_PROVIDER, type KycProvider } from '../../../core/providers/kyc-provider.js';
import { Workflow } from '../../../core/workflow/workflow.js';
import { TenantDirectory } from '../../iam/index.js';
import { kycCaseMachine, kycValidUntil } from '../domain/kyc.js';
import { investor, kycCase, kycDocument } from '../infrastructure/schema.js';
import { INVESTOR_EVENTS } from './investor-events.js';
import { InvestorsService } from './investors.service.js';

export type KycCaseRow = typeof kycCase.$inferSelect;

export interface KycCaseDocument {
  documentId: string;
  kind: string;
  name: string;
  attachedAt: Date;
}

export type KycCaseDetail = KycCaseRow & { documents: KycCaseDocument[] };

/** Kinds of evidence of a KYC/KYB case. */
export const KYC_DOCUMENT_KINDS = [
  'REGISTRATION_EXTRACT',
  'ARTICLES_OF_ASSOCIATION',
  'REPRESENTATIVE_ID',
  'BENEFICIAL_OWNERS_DECLARATION',
  'PROOF_OF_ADDRESS',
  'OTHER',
] as const;
export type KycDocumentKind = (typeof KYC_DOCUMENT_KINDS)[number];

const UNIQUE_VIOLATION = '23505';

/**
 * KYC/KYB cases (SPEC §8.2, §4.8). The issuer's staff open and prepare a case, attach evidence
 * and submit it; the fictitious provider gives a recommendation; a Compliance Officer who did not
 * prepare it approves, rejects or sends it back. The investor's KYC status follows its case.
 */
@Injectable()
export class KycService {
  private readonly provider = new CircuitBreaker();

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(KYC_PROVIDER) private readonly kycProvider: KycProvider,
    private readonly investors: InvestorsService,
    private readonly documents: DocumentsService,
    private readonly workflow: Workflow,
    private readonly audit: AuditWriter,
    private readonly outbox: Outbox,
    private readonly tenants: TenantDirectory,
  ) {}

  /** An investor (portal) only sees its own cases. */
  private scopeOf(user: RequestUser): SQL | undefined {
    if (user.permissions.get('kyc:read') !== 'own') return undefined;
    if (!user.investorId) throw new AppError('RESOURCE_NOT_FOUND');
    return eq(kycCase.investorId, user.investorId);
  }

  async list(
    filters: { investorId?: string; status?: KycCaseStatus },
    pagination: Pagination,
  ): Promise<Page<KycCaseRow & { investorName: string }>> {
    const user = currentUser();
    const conditions = [
      this.scopeOf(user),
      filters.investorId ? eq(kycCase.investorId, filters.investorId) : undefined,
      filters.status ? eq(kycCase.status, filters.status) : undefined,
    ].filter((condition): condition is SQL => condition !== undefined);
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    return withCurrentTenant(this.db, async (tx) => {
      const [{ total } = { total: 0 }] = await tx
        .select({ total: count() })
        .from(kycCase)
        .where(where);
      const rows = await tx
        .select({ kycCase, investorName: investor.legalName })
        .from(kycCase)
        .innerJoin(investor, eq(investor.id, kycCase.investorId))
        .where(where)
        .orderBy(desc(kycCase.updatedAt), desc(kycCase.id))
        .limit(pagination.pageSize)
        .offset(offsetOf(pagination));
      return {
        data: rows.map((row) => ({ ...row.kycCase, investorName: row.investorName })),
        meta: { ...pagination, total },
      };
    });
  }

  get(id: string): Promise<KycCaseDetail> {
    return withCurrentTenant(this.db, async (tx) => {
      const found = await this.find(tx, id);
      return { ...found, documents: await this.documentsOf(tx, id) };
    });
  }

  async open(investorId: string): Promise<KycCaseDetail> {
    const actor = currentUser();
    return withCurrentTenant(this.db, async (tx, tenantId) => {
      await this.investors.find(tx, investorId);
      let created: KycCaseRow;
      try {
        [created] = (await tx.transaction((savepoint) =>
          savepoint
            .insert(kycCase)
            .values({ tenantId, investorId, preparedBy: actor.userId, createdBy: actor.userId })
            .returning(),
        )) as [KycCaseRow];
      } catch (error) {
        // At most one open case per investor (unique index).
        if ((error as { cause?: { code?: string } }).cause?.code === UNIQUE_VIOLATION) {
          throw new AppError('VALIDATION_FAILED', [
            { code: 'OPEN_KYC_CASE_EXISTS', field: 'investorId' },
          ]);
        }
        throw error;
      }
      await this.workflow.start(tx, kycCaseMachine, {
        tenantId,
        resourceId: created.id,
        to: 'IN_PROGRESS',
      });
      await this.setInvestorStatus(tx, investorId, { kycStatus: 'IN_PROGRESS' });
      await this.audit.recordIn(tx, {
        tenantId,
        action: 'KYC_CASE_OPENED',
        resourceType: 'kyc_case',
        resourceId: created.id,
        newValue: { investorId, status: 'IN_PROGRESS' },
        result: 'SUCCESS',
      });
      return { ...created, documents: [] };
    });
  }

  /** Attaches evidence: a KYC_EVIDENCE document of the same investor, while the case is prepared. */
  async attachDocument(
    id: string,
    input: { documentId: string; kind: KycDocumentKind },
  ): Promise<KycCaseDetail> {
    const user = currentUser();
    return withCurrentTenant(this.db, async (tx, tenantId) => {
      const found = await this.find(tx, id);
      if (found.status !== 'IN_PROGRESS') throw new AppError('INVALID_STATE_TRANSITION');
      const evidence = await this.documents.findVisible(tx, user, input.documentId);
      if (evidence.type !== 'KYC_EVIDENCE' || evidence.investorId !== found.investorId) {
        throw new AppError('VALIDATION_FAILED', [
          { code: 'NOT_KYC_EVIDENCE_OF_INVESTOR', field: 'documentId' },
        ]);
      }
      await tx
        .insert(kycDocument)
        .values({ tenantId, kycCaseId: id, documentId: input.documentId, kind: input.kind })
        .onConflictDoNothing();
      await this.audit.recordIn(tx, {
        tenantId,
        action: 'KYC_DOCUMENT_ATTACHED',
        resourceType: 'kyc_case',
        resourceId: id,
        newValue: { documentId: input.documentId, kind: input.kind },
        result: 'SUCCESS',
      });
      return { ...found, documents: await this.documentsOf(tx, id) };
    });
  }

  /**
   * Submits the case: the fictitious provider is asked first (outside the transaction: an outage
   * gives 503 and the case stays in preparation), then the case waits for a decision.
   */
  async submit(id: string): Promise<KycCaseDetail> {
    const actor = currentUser();
    const prepared = await withCurrentTenant(this.db, async (tx) => {
      const found = await this.find(tx, id);
      const investorRow = await this.investors.find(tx, found.investorId);
      const evidence = await this.documentsOf(tx, id);
      return { found, investorRow, evidenceCount: evidence.length };
    });
    if (prepared.found.status !== 'IN_PROGRESS') throw new AppError('INVALID_STATE_TRANSITION');
    if (prepared.evidenceCount === 0) {
      throw new AppError('VALIDATION_FAILED', [
        { code: 'KYC_EVIDENCE_REQUIRED', field: 'documents' },
      ]);
    }
    const answer = await this.provider.call(() =>
      this.kycProvider.check({
        caseId: id,
        investorType: prepared.investorRow.type as 'LEGAL_ENTITY' | 'NATURAL_PERSON',
        countryCode: prepared.investorRow.countryOfIncorporation,
      }),
    );
    return withCurrentTenant(this.db, async (tx, tenantId) => {
      const found = await this.find(tx, id, true);
      await this.workflow.transition(tx, kycCaseMachine, {
        tenantId,
        resourceId: id,
        from: found.status as KycCaseStatus,
        to: 'PENDING_REVIEW',
      });
      const [updated] = await tx
        .update(kycCase)
        .set({
          status: 'PENDING_REVIEW',
          // The person who submits is the preparer: another person must decide (four eyes).
          preparedBy: actor.userId,
          preparedAt: new Date(),
          providerReference: answer.reference,
          providerOutcome: answer.outcome,
          suggestedRiskLevel: answer.suggestedRiskLevel,
          updatedAt: new Date(),
        })
        .where(eq(kycCase.id, id))
        .returning();
      await this.setInvestorStatus(tx, found.investorId, { kycStatus: 'PENDING_REVIEW' });
      await this.audit.recordIn(tx, {
        tenantId,
        action: 'KYC_CASE_SUBMITTED',
        resourceType: 'kyc_case',
        resourceId: id,
        oldValue: { status: 'IN_PROGRESS' },
        newValue: {
          status: 'PENDING_REVIEW',
          providerReference: answer.reference,
          providerOutcome: answer.outcome,
          suggestedRiskLevel: answer.suggestedRiskLevel,
        },
        result: 'SUCCESS',
      });
      await this.outbox.publish(tx, {
        tenantId,
        eventType: INVESTOR_EVENTS.kycSubmitted,
        aggregateType: 'kyc_case',
        aggregateId: id,
        payload: { investorId: found.investorId },
      });
      return { ...updated!, documents: await this.documentsOf(tx, id) };
    });
  }

  approve(id: string, comment?: string | null): Promise<KycCaseDetail> {
    return this.decide(id, 'APPROVED', comment ?? null);
  }

  reject(id: string, comment: string): Promise<KycCaseDetail> {
    return this.decide(id, 'REJECTED', comment);
  }

  sendBack(id: string, comment: string): Promise<KycCaseDetail> {
    return this.decide(id, 'IN_PROGRESS', comment);
  }

  private async decide(
    id: string,
    to: 'APPROVED' | 'REJECTED' | 'IN_PROGRESS',
    comment: string | null,
  ): Promise<KycCaseDetail> {
    const actor = currentUser();
    return withCurrentTenant(this.db, async (tx, tenantId) => {
      const found = await this.find(tx, id, true);
      await this.workflow.transition(tx, kycCaseMachine, {
        tenantId,
        resourceId: id,
        from: found.status as KycCaseStatus,
        to,
        comment,
        initiatorUserId: found.preparedBy,
      });
      const today = await this.todayOf(tx, tenantId);
      const validUntil = to === 'APPROVED' ? kycValidUntil(today) : null;
      const [updated] = await tx
        .update(kycCase)
        .set({
          status: to,
          decidedBy: to === 'IN_PROGRESS' ? null : actor.userId,
          decidedAt: to === 'IN_PROGRESS' ? null : new Date(),
          decisionComment: comment?.trim() || null,
          validUntil,
          updatedAt: new Date(),
        })
        .where(eq(kycCase.id, id))
        .returning();
      if (to === 'APPROVED') {
        await this.setInvestorStatus(tx, found.investorId, {
          kycStatus: 'APPROVED',
          kycLastReviewDate: today,
          kycExpiryDate: validUntil,
          ...(found.suggestedRiskLevel ? { riskLevel: found.suggestedRiskLevel } : {}),
        });
      } else {
        await this.setInvestorStatus(tx, found.investorId, { kycStatus: to });
      }
      await this.audit.recordIn(tx, {
        tenantId,
        action: {
          APPROVED: 'KYC_APPROVED',
          REJECTED: 'KYC_REJECTED',
          IN_PROGRESS: 'KYC_SENT_BACK',
        }[to],
        resourceType: 'kyc_case',
        resourceId: id,
        oldValue: { status: found.status },
        newValue: { status: to, validUntil },
        result: 'SUCCESS',
      });
      await this.outbox.publish(tx, {
        tenantId,
        eventType: INVESTOR_EVENTS.kycDecided,
        aggregateType: 'kyc_case',
        aggregateId: id,
        payload: { investorId: found.investorId, decision: to, validUntil },
      });
      return { ...updated!, documents: await this.documentsOf(tx, id) };
    });
  }

  /** Today in the tenant's time zone (decision D-015). */
  todayOf(tx: Transaction, tenantId: string): Promise<string> {
    return this.tenants.todayOf(tx, tenantId);
  }

  /** In the caller's transaction, within the user's scope; `lock` serialises the decisions. */
  private async find(tx: Transaction, id: string, lock = false): Promise<KycCaseRow> {
    const scope = this.scopeOf(currentUser());
    const query = tx
      .select()
      .from(kycCase)
      .where(scope ? and(eq(kycCase.id, id), scope) : eq(kycCase.id, id));
    const [found] = lock ? await query.for('update') : await query;
    if (!found) throw new AppError('RESOURCE_NOT_FOUND');
    return found;
  }

  private async documentsOf(tx: Transaction, caseId: string): Promise<KycCaseDocument[]> {
    const visible = this.documents.visibleTo(currentUser());
    return tx
      .select({
        documentId: kycDocument.documentId,
        kind: kycDocument.kind,
        name: document.name,
        attachedAt: kycDocument.createdAt,
      })
      .from(kycDocument)
      .innerJoin(document, eq(document.id, kycDocument.documentId))
      .where(
        visible
          ? and(eq(kycDocument.kycCaseId, caseId), visible)
          : eq(kycDocument.kycCaseId, caseId),
      )
      .orderBy(asc(kycDocument.createdAt));
  }

  private async setInvestorStatus(
    tx: Transaction,
    investorId: string,
    values: Partial<typeof investor.$inferInsert>,
  ): Promise<void> {
    await tx
      .update(investor)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(investor.id, investorId));
  }
}
