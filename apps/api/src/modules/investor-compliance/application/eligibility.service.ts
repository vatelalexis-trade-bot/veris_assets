import { Inject, Injectable } from '@nestjs/common';
import type { EligibilityStatus } from '@virtus/shared';
import { and, count, desc, eq, type SQL } from 'drizzle-orm';
import { AuditWriter } from '../../../core/audit/audit-writer.js';
import { currentUser } from '../../../core/context/request-context.js';
import {
  DATABASE,
  type Database,
  type Transaction,
  withCurrentTenant,
} from '../../../core/database/database.js';
import { AppError } from '../../../core/errors/app-error.js';
import { offsetOf, type Page, type Pagination } from '../../../core/http/pagination.js';
import { Workflow } from '../../../core/workflow/workflow.js';
import {
  evaluateEligibility,
  failedRuleCodes,
  type EligibilityInvestor,
  type EligibilityResult,
  type EligibilityRuleSet,
} from '../domain/eligibility.js';
import { eligibilityStatusMachine } from '../domain/eligibility-status.js';
import { eligibilityAssessment, investor } from '../infrastructure/schema.js';
import { InvestorsService, type InvestorRow } from './investors.service.js';
import { KycService } from './kyc.service.js';

export type EligibilityAssessmentRow = typeof eligibilityAssessment.$inferSelect;
export type AssessmentContext = 'INVITATION' | 'SUBSCRIPTION' | 'TRANSFER';

export interface AssessmentRequest {
  investorId: string;
  issuanceId?: string | null;
  ruleSet: EligibilityRuleSet;
  context: AssessmentContext;
  currentInvestorCount?: number;
  alreadyInvestor?: boolean;
}

/**
 * The checks a Compliance Officer's decision is recorded with: the investor's general situation
 * (profile, KYC/KYB), whatever the issuance.
 */
const GENERAL_RULES: EligibilityRuleSet = {
  professionalOnly: false,
  allowedCountries: [],
  excludedCountries: [],
  allowedInvestorTypes: [],
  allowedClassifications: [],
  kycRequired: true,
  kycMinRemainingValidityDays: 0,
  maxInvestors: null,
  rulesVersion: 0,
};

function factsOf(row: InvestorRow): EligibilityInvestor {
  return {
    type: row.type as EligibilityInvestor['type'],
    classification: row.classification as EligibilityInvestor['classification'],
    countryOfIncorporation: row.countryOfIncorporation,
    profileStatus: row.profileStatus as EligibilityInvestor['profileStatus'],
    kycStatus: row.kycStatus as EligibilityInvestor['kycStatus'],
    kycExpiryDate: row.kycExpiryDate,
    eligibilityStatus: row.eligibilityStatus as EligibilityStatus,
  };
}

/**
 * Eligibility decisions (SPEC §8.4): the engine's, recorded when an invitation, a subscription or
 * a transfer depends on them, and the Compliance Officer's manual ones. Every decision is kept.
 */
@Injectable()
export class EligibilityService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly investors: InvestorsService,
    private readonly kyc: KycService,
    private readonly workflow: Workflow,
    private readonly audit: AuditWriter,
  ) {}

  /**
   * Evaluates and records a decision, in the caller's business transaction (used by the
   * invitations, subscriptions and transfers of the next phases).
   */
  async assess(
    tx: Transaction,
    tenantId: string,
    request: AssessmentRequest,
  ): Promise<{ assessment: EligibilityAssessmentRow; result: EligibilityResult }> {
    const result = await this.evaluate(tx, tenantId, request);
    const [assessment] = await tx
      .insert(eligibilityAssessment)
      .values({
        tenantId,
        investorId: request.investorId,
        issuanceId: request.issuanceId ?? null,
        context: request.context,
        result: result.result,
        rules: result.rules,
        ruleSet: request.ruleSet,
        rulesVersion: result.rulesVersion,
        decidedByUserId: null,
        decidedBySystem: true,
      })
      .returning();
    await this.audit.recordIn(tx, {
      tenantId,
      action: 'ELIGIBILITY_ASSESSED',
      resourceType: 'investor',
      resourceId: request.investorId,
      newValue: {
        assessmentId: assessment!.id,
        context: request.context,
        issuanceId: request.issuanceId ?? null,
        result: result.result,
        rulesVersion: result.rulesVersion,
      },
      result: 'SUCCESS',
      ...(result.result === 'NOT_ELIGIBLE' ? { reason: failedRuleCodes(result).join(',') } : {}),
    });
    return { assessment: assessment!, result };
  }

  /** Evaluation without recording anything ("what if", docs/API.md §2.5). */
  preview(request: Omit<AssessmentRequest, 'context' | 'issuanceId'>): Promise<EligibilityResult> {
    return withCurrentTenant(this.db, (tx, tenantId) => this.evaluate(tx, tenantId, request));
  }

  private async evaluate(
    tx: Transaction,
    tenantId: string,
    request: Omit<AssessmentRequest, 'context'>,
  ): Promise<EligibilityResult> {
    const row = await this.investors.find(tx, request.investorId);
    return evaluateEligibility(factsOf(row), request.ruleSet, {
      today: await this.kyc.todayOf(tx, tenantId),
      currentInvestorCount: request.currentInvestorCount ?? 0,
      alreadyInvestor: request.alreadyInvestor ?? false,
    });
  }

  /** Manual decision of a Compliance Officer, recorded with the investor's situation at that time. */
  async setStatus(
    investorId: string,
    status: Exclude<EligibilityStatus, 'NOT_ASSESSED'>,
    justification: string,
  ): Promise<InvestorRow> {
    const actor = currentUser();
    return withCurrentTenant(this.db, async (tx, tenantId) => {
      const before = await this.investors.find(tx, investorId);
      await this.workflow.transition(tx, eligibilityStatusMachine, {
        tenantId,
        resourceId: investorId,
        from: before.eligibilityStatus as EligibilityStatus,
        to: status,
        comment: justification,
      });
      const [updated] = await tx
        .update(investor)
        .set({ eligibilityStatus: status, updatedAt: new Date() })
        .where(eq(investor.id, investorId))
        .returning();
      const situation = evaluateEligibility(factsOf(updated!), GENERAL_RULES, {
        today: await this.kyc.todayOf(tx, tenantId),
        currentInvestorCount: 0,
        alreadyInvestor: true,
      });
      const [assessment] = await tx
        .insert(eligibilityAssessment)
        .values({
          tenantId,
          investorId,
          context: 'MANUAL',
          result: status === 'ELIGIBLE' ? 'ELIGIBLE' : 'NOT_ELIGIBLE',
          rules: situation.rules,
          rulesVersion: situation.rulesVersion,
          decidedByUserId: actor.userId,
          decidedBySystem: false,
          justification: justification.trim(),
        })
        .returning();
      await this.audit.recordIn(tx, {
        tenantId,
        action: 'ELIGIBILITY_STATUS_CHANGED',
        resourceType: 'investor',
        resourceId: investorId,
        oldValue: { eligibilityStatus: before.eligibilityStatus },
        newValue: { eligibilityStatus: status, assessmentId: assessment!.id },
        result: 'SUCCESS',
      });
      return updated!;
    });
  }

  async list(
    filters: { investorId?: string; context?: AssessmentContext | 'MANUAL' },
    pagination: Pagination,
  ): Promise<Page<EligibilityAssessmentRow & { investorName: string }>> {
    const conditions = [
      filters.investorId ? eq(eligibilityAssessment.investorId, filters.investorId) : undefined,
      filters.context ? eq(eligibilityAssessment.context, filters.context) : undefined,
    ].filter((condition): condition is SQL => condition !== undefined);
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    return withCurrentTenant(this.db, async (tx) => {
      const [{ total } = { total: 0 }] = await tx
        .select({ total: count() })
        .from(eligibilityAssessment)
        .where(where);
      const rows = await tx
        .select({ assessment: eligibilityAssessment, investorName: investor.legalName })
        .from(eligibilityAssessment)
        .innerJoin(investor, eq(investor.id, eligibilityAssessment.investorId))
        .where(where)
        .orderBy(desc(eligibilityAssessment.assessedAt), desc(eligibilityAssessment.id))
        .limit(pagination.pageSize)
        .offset(offsetOf(pagination));
      return {
        data: rows.map((row) => ({ ...row.assessment, investorName: row.investorName })),
        meta: { ...pagination, total },
      };
    });
  }

  async get(id: string): Promise<EligibilityAssessmentRow & { investorName: string }> {
    return withCurrentTenant(this.db, async (tx) => {
      const [row] = await tx
        .select({ assessment: eligibilityAssessment, investorName: investor.legalName })
        .from(eligibilityAssessment)
        .innerJoin(investor, eq(investor.id, eligibilityAssessment.investorId))
        .where(eq(eligibilityAssessment.id, id));
      if (!row) throw new AppError('RESOURCE_NOT_FOUND');
      return { ...row.assessment, investorName: row.investorName };
    });
  }
}
