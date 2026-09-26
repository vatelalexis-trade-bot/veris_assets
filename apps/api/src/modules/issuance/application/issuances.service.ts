import { Inject, Injectable } from '@nestjs/common';
import type { IssuanceStatus, IssuanceWizardStep } from '@virtus/shared';
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  notInArray,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { AuditWriter } from '../../../core/audit/audit-writer.js';
import { changedValues } from '../../../core/audit/changed-values.js';
import { currentUser, type RequestUser } from '../../../core/context/request-context.js';
import {
  DATABASE,
  type Database,
  type Transaction,
  withCurrentTenant,
} from '../../../core/database/database.js';
import { document, workflowTransition } from '../../../core/database/schema.js';
import { DocumentsService } from '../../../core/documents/documents.service.js';
import { AppError } from '../../../core/errors/app-error.js';
import { offsetOf, type Page, type Pagination } from '../../../core/http/pagination.js';
import { Outbox } from '../../../core/outbox/outbox.js';
import { Workflow } from '../../../core/workflow/workflow.js';
import { TenantDirectory, UserDirectory } from '../../iam/index.js';
import { checkIssuance, type CheckFailure } from '../domain/issuance-checks.js';
import { isEditable, issuanceMachine } from '../domain/issuance-machine.js';
import {
  eligibilityRuleSet,
  investorInvitation,
  issuance,
  issuanceDocument,
  issuanceTerms,
} from '../infrastructure/schema.js';
import { ISSUANCE_EVENTS } from './issuance-events.js';

export type IssuanceRow = typeof issuance.$inferSelect;
export type TermsRow = typeof issuanceTerms.$inferSelect;
export type RuleSetRow = typeof eligibilityRuleSet.$inferSelect;
export interface IssuanceDetail {
  issuance: IssuanceRow;
  terms: TermsRow;
  rules: RuleSetRow;
}

export type GeneralInput = Partial<
  Pick<
    IssuanceRow,
    | 'name'
    | 'code'
    | 'description'
    | 'assetCategory'
    | 'countryCode'
    | 'currency'
    | 'legalIssuerName'
    | 'spvName'
  >
> & { wizardStep?: IssuanceWizardStep };
export type TermsInput = Partial<
  Omit<TermsRow, 'issuanceId' | 'tenantId' | 'createdAt' | 'updatedAt' | 'createdBy' | 'version'>
>;
export type RulesInput = Partial<
  Omit<
    RuleSetRow,
    'issuanceId' | 'tenantId' | 'createdAt' | 'updatedAt' | 'createdBy' | 'version' | 'rulesVersion'
  >
>;

export interface IssuanceFilters {
  status?: IssuanceStatus;
  assetCategory?: string;
  currency?: string;
  q?: string;
}

/** Statuses an invited investor may see (never a draft or an issuance under review). */
const HIDDEN_FROM_INVESTORS: IssuanceStatus[] = ['DRAFT', 'UNDER_REVIEW'];
const UNIQUE_VIOLATION = '23505';

/**
 * Issuances (SPEC §6, §7): drafts built with the wizard, checks of §6.3, life cycle with four
 * eyes. Every change is audited and every transition recorded, in the same transaction.
 */
@Injectable()
export class IssuancesService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly workflow: Workflow,
    private readonly audit: AuditWriter,
    private readonly outbox: Outbox,
    private readonly documents: DocumentsService,
    private readonly users: UserDirectory,
    private readonly tenants: TenantDirectory,
  ) {}

  /** An investor only sees the issuances it is invited to (SPEC §4.5). */
  private scopeOf(user: RequestUser): SQL | undefined {
    if (user.permissions.get('issuance:read') !== 'own') return undefined;
    if (!user.investorId) return sql`false`;
    return and(
      notInArray(issuance.status, HIDDEN_FROM_INVESTORS),
      inArray(
        issuance.id,
        this.db
          .select({ id: investorInvitation.issuanceId })
          .from(investorInvitation)
          .where(
            and(
              eq(investorInvitation.investorId, user.investorId),
              eq(investorInvitation.status, 'INVITED'),
            ),
          ),
      ),
    );
  }

  async list(filters: IssuanceFilters, pagination: Pagination): Promise<Page<IssuanceDetail>> {
    const conditions = [
      this.scopeOf(currentUser()),
      filters.status ? eq(issuance.status, filters.status) : undefined,
      filters.assetCategory ? eq(issuance.assetCategory, filters.assetCategory) : undefined,
      filters.currency ? eq(issuance.currency, filters.currency) : undefined,
      filters.q
        ? or(
            ilike(issuance.name, `%${filters.q.replace(/[\\%_]/g, '\\$&')}%`),
            ilike(issuance.code, `%${filters.q.replace(/[\\%_]/g, '\\$&')}%`),
          )
        : undefined,
    ].filter((condition): condition is SQL => condition !== undefined);
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    return withCurrentTenant(this.db, async (tx) => {
      const [{ total } = { total: 0 }] = await tx
        .select({ total: count() })
        .from(issuance)
        .where(where);
      const rows = await tx
        .select({ issuance, terms: issuanceTerms, rules: eligibilityRuleSet })
        .from(issuance)
        .innerJoin(issuanceTerms, eq(issuanceTerms.issuanceId, issuance.id))
        .innerJoin(eligibilityRuleSet, eq(eligibilityRuleSet.issuanceId, issuance.id))
        .where(where)
        .orderBy(desc(issuance.updatedAt), asc(issuance.id))
        .limit(pagination.pageSize)
        .offset(offsetOf(pagination));
      return { data: rows, meta: { ...pagination, total } };
    });
  }

  get(id: string): Promise<IssuanceDetail> {
    return withCurrentTenant(this.db, (tx) => this.find(tx, id));
  }

  /** In the caller's transaction, within the user's scope; `lock` serialises the transitions. */
  find(tx: Transaction, id: string, lock = false): Promise<IssuanceDetail> {
    return this.findWhere(tx, id, lock, this.scopeOf(currentUser()));
  }

  /**
   * Without the investor's invitation scope, for the registry: a holder may have received its
   * units by transfer without being invited. The caller checks what the user may do.
   */
  findForRegistry(tx: Transaction, id: string, lock = false): Promise<IssuanceDetail> {
    return this.findWhere(tx, id, lock, undefined);
  }

  private async findWhere(
    tx: Transaction,
    id: string,
    lock: boolean,
    scope: SQL | undefined,
  ): Promise<IssuanceDetail> {
    const where = scope ? and(eq(issuance.id, id), scope) : eq(issuance.id, id);
    // The issuance row alone is locked (PostgreSQL refuses "FOR UPDATE OF schema.table").
    if (lock) await tx.select({ id: issuance.id }).from(issuance).where(where).for('update');
    const [found] = await tx
      .select({ issuance, terms: issuanceTerms, rules: eligibilityRuleSet })
      .from(issuance)
      .innerJoin(issuanceTerms, eq(issuanceTerms.issuanceId, issuance.id))
      .innerJoin(eligibilityRuleSet, eq(eligibilityRuleSet.issuanceId, issuance.id))
      .where(where);
    if (!found) throw new AppError('RESOURCE_NOT_FOUND');
    return found;
  }

  async create(input: GeneralInput & { name: string; code: string }): Promise<IssuanceDetail> {
    const actor = currentUser();
    return withCurrentTenant(this.db, async (tx, tenantId) => {
      let created: IssuanceRow;
      try {
        [created] = (await tx.transaction((savepoint) =>
          savepoint
            .insert(issuance)
            .values({ ...input, code: input.code.toUpperCase(), tenantId, createdBy: actor.userId })
            .returning(),
        )) as [IssuanceRow];
      } catch (error) {
        throw this.codeTaken(error);
      }
      await tx
        .insert(issuanceTerms)
        .values({ issuanceId: created.id, tenantId, createdBy: actor.userId });
      await tx
        .insert(eligibilityRuleSet)
        .values({ issuanceId: created.id, tenantId, createdBy: actor.userId });
      await this.workflow.start(tx, issuanceMachine, {
        tenantId,
        resourceId: created.id,
        to: 'DRAFT',
      });
      await this.audit.recordIn(tx, {
        tenantId,
        action: 'ISSUANCE_CREATED',
        resourceType: 'issuance',
        resourceId: created.id,
        newValue: { ...input },
        result: 'SUCCESS',
      });
      return this.find(tx, created.id);
    });
  }

  /** Step 1 (and the step reached in the wizard); a draft only, with optimistic locking. */
  async updateGeneral(id: string, version: number, changes: GeneralInput): Promise<IssuanceDetail> {
    return withCurrentTenant(this.db, async (tx, tenantId) => {
      const before = await this.editable(tx, id);
      if (before.issuance.version !== version) throw new AppError('VERSION_CONFLICT');
      const values = changes.code ? { ...changes, code: changes.code.toUpperCase() } : changes;
      try {
        await tx.transaction((savepoint) =>
          savepoint
            .update(issuance)
            .set({ ...values, version: sql`${issuance.version} + 1`, updatedAt: new Date() })
            .where(eq(issuance.id, id)),
        );
      } catch (error) {
        throw this.codeTaken(error);
      }
      // Moving between the wizard's steps is not worth an audit entry; a changed value is.
      const changed = changedValues(before.issuance, values);
      delete changed.oldValue.wizardStep;
      delete changed.newValue.wizardStep;
      if (Object.keys(changed.newValue).length > 0) {
        await this.audit.recordIn(tx, {
          tenantId,
          action: 'ISSUANCE_UPDATED',
          resourceType: 'issuance',
          resourceId: id,
          ...changed,
          result: 'SUCCESS',
        });
      }
      return this.find(tx, id);
    });
  }

  /** Steps 2 and 4: financial terms and servicing. */
  async updateTerms(id: string, version: number, changes: TermsInput): Promise<IssuanceDetail> {
    return withCurrentTenant(this.db, async (tx, tenantId) => {
      const before = await this.editable(tx, id);
      if (before.terms.version !== version) throw new AppError('VERSION_CONFLICT');
      await tx
        .update(issuanceTerms)
        .set({ ...changes, version: sql`${issuanceTerms.version} + 1`, updatedAt: new Date() })
        .where(eq(issuanceTerms.issuanceId, id));
      await this.touch(tx, id);
      await this.audit.recordIn(tx, {
        tenantId,
        action: 'ISSUANCE_TERMS_UPDATED',
        resourceType: 'issuance',
        resourceId: id,
        ...changedValues(before.terms, changes),
        result: 'SUCCESS',
      });
      return this.find(tx, id);
    });
  }

  /** Step 3: eligibility rules. Each change gives a new version of the rule set. */
  async updateRules(id: string, version: number, changes: RulesInput): Promise<IssuanceDetail> {
    return withCurrentTenant(this.db, async (tx, tenantId) => {
      const before = await this.editable(tx, id);
      if (before.rules.version !== version) throw new AppError('VERSION_CONFLICT');
      await tx
        .update(eligibilityRuleSet)
        .set({
          ...changes,
          version: sql`${eligibilityRuleSet.version} + 1`,
          rulesVersion: sql`${eligibilityRuleSet.rulesVersion} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(eligibilityRuleSet.issuanceId, id));
      await this.touch(tx, id);
      await this.audit.recordIn(tx, {
        tenantId,
        action: 'ISSUANCE_RULES_UPDATED',
        resourceType: 'issuance',
        resourceId: id,
        ...changedValues(before.rules, changes),
        result: 'SUCCESS',
      });
      return this.find(tx, id);
    });
  }

  /** Checks of §6.3 without submitting (shown in the wizard). */
  validate(id: string): Promise<CheckFailure[]> {
    return withCurrentTenant(this.db, async (tx) => checksOf(await this.find(tx, id)));
  }

  async submit(id: string): Promise<IssuanceDetail> {
    const actor = currentUser();
    return this.transition(id, 'UNDER_REVIEW', null, async (tx, found) => {
      const failures = checksOf(found);
      if (failures.length > 0) {
        throw new AppError(
          'ISSUANCE_INCONSISTENT_TERMS',
          failures.map((failure) => ({ code: failure.code, field: failure.field ?? null })),
        );
      }
      await tx
        .update(issuance)
        .set({
          submittedBy: actor.userId,
          submittedAt: new Date(),
          statusComment: null,
          wizardStep: 'REVIEW',
        })
        .where(eq(issuance.id, id));
      return { event: ISSUANCE_EVENTS.submitted };
    });
  }

  async approve(id: string): Promise<IssuanceDetail> {
    const actor = currentUser();
    return this.transition(id, 'APPROVED', null, async (tx) => {
      await tx
        .update(issuance)
        .set({ approvedBy: actor.userId, approvedAt: new Date() })
        .where(eq(issuance.id, id));
      return { event: ISSUANCE_EVENTS.decided, payload: { decision: 'APPROVED' } };
    });
  }

  async returnToDraft(id: string, comment: string): Promise<IssuanceDetail> {
    return this.transition(id, 'DRAFT', comment, async (tx) => {
      await tx.update(issuance).set({ statusComment: comment.trim() }).where(eq(issuance.id, id));
      return { event: ISSUANCE_EVENTS.decided, payload: { decision: 'DRAFT' } };
    });
  }

  async openSubscription(id: string): Promise<IssuanceDetail> {
    return this.transition(id, 'SUBSCRIPTION_OPEN', null, async (tx, found) => {
      const today = await this.tenants.todayOf(tx, found.issuance.tenantId);
      if (found.terms.subscriptionStartDate && today < found.terms.subscriptionStartDate) {
        throw new AppError('SUBSCRIPTION_WINDOW_NOT_STARTED', [
          {
            code: 'SUBSCRIPTION_START_DATE',
            field: 'terms.subscriptionStartDate',
            meta: { startDate: found.terms.subscriptionStartDate },
          },
        ]);
      }
      if (found.terms.subscriptionEndDate && today > found.terms.subscriptionEndDate) {
        throw new AppError('SUBSCRIPTION_WINDOW_CLOSED');
      }
      return { event: ISSUANCE_EVENTS.opened };
    });
  }

  closeSubscription(id: string): Promise<IssuanceDetail> {
    return this.transition(id, 'SUBSCRIPTION_CLOSED', null, () => Promise.resolve({ event: null }));
  }

  /** Subscriptions in progress are cancelled with it (phase 11) and the investors notified. */
  cancel(id: string, comment: string): Promise<IssuanceDetail> {
    return this.transition(id, 'CANCELLED', comment, async (tx) => {
      await tx.update(issuance).set({ statusComment: comment.trim() }).where(eq(issuance.id, id));
      return { event: ISSUANCE_EVENTS.cancelled };
    });
  }

  /**
   * One transition: machine check (who, comment, four eyes), the use case's own checks and
   * changes, the recorded transition, the audit entry and the event — all in one transaction.
   */
  private transition(
    id: string,
    to: IssuanceStatus,
    comment: string | null,
    apply: (
      tx: Transaction,
      found: IssuanceDetail,
    ) => Promise<{ event: string | null; payload?: Record<string, string> }>,
  ): Promise<IssuanceDetail> {
    return withCurrentTenant(this.db, async (tx, tenantId) => {
      await this.applyTransition(tx, tenantId, await this.find(tx, id, true), to, comment, apply);
      return this.find(tx, id);
    });
  }

  /**
   * The allocation of the issuance was validated (registry, SPEC §10.1): SUBSCRIPTION_CLOSED →
   * ALLOCATED in the caller's transaction, with the ledger entries.
   */
  async markAllocated(tx: Transaction, tenantId: string, id: string): Promise<void> {
    await this.applyTransition(tx, tenantId, await this.find(tx, id, true), 'ALLOCATED', null, () =>
      Promise.resolve({ event: null }),
    );
  }

  private async applyTransition(
    tx: Transaction,
    tenantId: string,
    found: IssuanceDetail,
    to: IssuanceStatus,
    comment: string | null,
    apply: (
      tx: Transaction,
      found: IssuanceDetail,
    ) => Promise<{ event: string | null; payload?: Record<string, string> }>,
  ): Promise<void> {
    const id = found.issuance.id;
    const from = found.issuance.status as IssuanceStatus;
    await this.workflow.transition(tx, issuanceMachine, {
      tenantId,
      resourceId: id,
      from,
      to,
      comment,
      initiatorUserId: found.issuance.submittedBy,
    });
    const { event, payload } = await apply(tx, found);
    await tx
      .update(issuance)
      .set({ status: to, version: sql`${issuance.version} + 1`, updatedAt: new Date() })
      .where(eq(issuance.id, id));
    await this.audit.recordIn(tx, {
      tenantId,
      action: `ISSUANCE_${to === 'DRAFT' ? 'RETURNED_TO_DRAFT' : to}`,
      resourceType: 'issuance',
      resourceId: id,
      oldValue: { status: from },
      newValue: { status: to },
      result: 'SUCCESS',
      ...(comment ? { reason: 'COMMENTED' } : {}),
    });
    if (event) {
      await this.outbox.publish(tx, {
        tenantId,
        eventType: event,
        aggregateType: 'issuance',
        aggregateId: id,
        payload: { code: found.issuance.code, ...(payload ?? {}) },
      });
    }
  }

  /** History of the statuses (SPEC §7: who, when, comment). */
  async transitions(id: string) {
    return withCurrentTenant(this.db, async (tx) => {
      await this.find(tx, id);
      const rows = await tx
        .select()
        .from(workflowTransition)
        .where(
          and(
            eq(workflowTransition.resourceType, 'issuance'),
            eq(workflowTransition.resourceId, id),
          ),
        )
        .orderBy(asc(workflowTransition.occurredAt));
      const names = await this.users.namesOf(
        tx,
        rows.flatMap((row) => (row.actorUserId ? [row.actorUserId] : [])),
      );
      return rows.map((row) => ({
        ...row,
        actorName: row.actorUserId ? (names.get(row.actorUserId) ?? null) : null,
      }));
    });
  }

  // Documents (step 5)

  async attachDocument(id: string, input: { documentId: string; kind: string }) {
    const user = currentUser();
    return withCurrentTenant(this.db, async (tx, tenantId) => {
      const found = await this.find(tx, id);
      if (found.issuance.status === 'CANCELLED') throw new AppError('INVALID_STATE_TRANSITION');
      const attached = await this.documents.findVisible(tx, user, input.documentId);
      if (attached.issuanceId !== id) {
        throw new AppError('VALIDATION_FAILED', [
          { code: 'NOT_A_DOCUMENT_OF_ISSUANCE', field: 'documentId' },
        ]);
      }
      await tx
        .insert(issuanceDocument)
        .values({ issuanceId: id, documentId: input.documentId, tenantId, kind: input.kind })
        .onConflictDoNothing();
      await this.audit.recordIn(tx, {
        tenantId,
        action: 'ISSUANCE_DOCUMENT_ATTACHED',
        resourceType: 'issuance',
        resourceId: id,
        newValue: { documentId: input.documentId, kind: input.kind },
        result: 'SUCCESS',
      });
      return this.documentsOf(tx, id);
    });
  }

  listDocuments(id: string) {
    return withCurrentTenant(this.db, async (tx) => {
      await this.find(tx, id);
      return this.documentsOf(tx, id);
    });
  }

  private documentsOf(tx: Transaction, id: string) {
    const visible = this.documents.visibleTo(currentUser());
    return tx
      .select({
        documentId: issuanceDocument.documentId,
        kind: issuanceDocument.kind,
        name: document.name,
        confidentiality: document.confidentiality,
        status: document.status,
      })
      .from(issuanceDocument)
      .innerJoin(document, eq(document.id, issuanceDocument.documentId))
      .where(
        visible
          ? and(eq(issuanceDocument.issuanceId, id), visible)
          : eq(issuanceDocument.issuanceId, id),
      )
      .orderBy(asc(issuanceDocument.createdAt));
  }

  private async editable(tx: Transaction, id: string): Promise<IssuanceDetail> {
    const found = await this.find(tx, id, true);
    if (!isEditable(found.issuance.status as IssuanceStatus))
      throw new AppError('INVALID_STATE_TRANSITION');
    return found;
  }

  /** A change of the terms or rules also changes the issuance (sort order, ETag of the whole). */
  private async touch(tx: Transaction, id: string): Promise<void> {
    await tx.update(issuance).set({ updatedAt: new Date() }).where(eq(issuance.id, id));
  }

  private codeTaken(error: unknown): unknown {
    const code = (error as { cause?: { code?: string } }).cause?.code;
    return code === UNIQUE_VIOLATION
      ? new AppError('VALIDATION_FAILED', [{ code: 'ISSUANCE_CODE_TAKEN', field: 'code' }])
      : error;
  }
}

/** The §6.3 checks of an issuance as stored. */
export function checksOf(found: IssuanceDetail): CheckFailure[] {
  const { issuance: row, terms, rules } = found;
  return checkIssuance({
    name: row.name,
    code: row.code,
    assetCategory: row.assetCategory,
    countryCode: row.countryCode,
    currency: row.currency,
    legalIssuerName: row.legalIssuerName,
    terms: {
      targetAmount: terms.targetAmount,
      minimumAmount: terms.minimumAmount,
      maximumAmount: terms.maximumAmount,
      nominalValue: terms.nominalValue,
      totalUnits: terms.totalUnits,
      interestRate: terms.interestRate,
      rateType: terms.rateType,
      distributionFrequency: terms.distributionFrequency,
      dayCount: terms.dayCount,
      issueDate: terms.issueDate,
      maturityDate: terms.maturityDate,
      subscriptionStartDate: terms.subscriptionStartDate,
      subscriptionEndDate: terms.subscriptionEndDate,
      minSubscriptionAmount: terms.minSubscriptionAmount,
      maxAmountPerInvestor: terms.maxAmountPerInvestor,
    },
    allowedCountries: rules.allowedCountries,
    excludedCountries: rules.excludedCountries,
  });
}
