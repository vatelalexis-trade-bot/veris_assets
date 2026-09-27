import { Inject, Injectable } from '@nestjs/common';
import type { IssuanceStatus } from '@veris/shared';
import { and, asc, eq } from 'drizzle-orm';
import { AuditWriter } from '../../../core/audit/audit-writer.js';
import { currentUser } from '../../../core/context/request-context.js';
import { DATABASE, type Database, withCurrentTenant } from '../../../core/database/database.js';
import { AppError } from '../../../core/errors/app-error.js';
import { Outbox } from '../../../core/outbox/outbox.js';
import {
  EligibilityService,
  investor,
  type EligibilityRuleSet,
} from '../../investor-compliance/index.js';
import { acceptsInvitations } from '../domain/issuance-machine.js';
import { investorInvitation } from '../infrastructure/schema.js';
import { ISSUANCE_EVENTS } from './issuance-events.js';
import { IssuancesService, type RuleSetRow } from './issuances.service.js';

/** The eligibility rules of an issuance, as the engine reads them. */
export function ruleSetOf(rules: RuleSetRow): EligibilityRuleSet {
  return {
    professionalOnly: rules.professionalOnly,
    allowedCountries: rules.allowedCountries,
    excludedCountries: rules.excludedCountries,
    allowedInvestorTypes: rules.allowedInvestorTypes as EligibilityRuleSet['allowedInvestorTypes'],
    allowedClassifications:
      rules.allowedClassifications as EligibilityRuleSet['allowedClassifications'],
    kycRequired: rules.kycRequired,
    kycMinRemainingValidityDays: rules.kycMinRemainingValidityDays,
    maxInvestors: rules.maxInvestors,
    rulesVersion: rules.rulesVersion,
  };
}

/**
 * Investors invited to an issuance — its whitelist (SPEC §8.4). An investor is invited only when
 * the eligibility engine finds it eligible; the decision is recorded either way (D-052).
 */
@Injectable()
export class InvitationsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly issuances: IssuancesService,
    private readonly eligibility: EligibilityService,
    private readonly audit: AuditWriter,
    private readonly outbox: Outbox,
  ) {}

  list(issuanceId: string) {
    return withCurrentTenant(this.db, async (tx) => {
      await this.issuances.find(tx, issuanceId);
      return tx
        .select({
          id: investorInvitation.id,
          investorId: investorInvitation.investorId,
          investorName: investor.legalName,
          status: investorInvitation.status,
          eligibilityAssessmentId: investorInvitation.eligibilityAssessmentId,
          invitedAt: investorInvitation.invitedAt,
          revokedAt: investorInvitation.revokedAt,
        })
        .from(investorInvitation)
        .innerJoin(investor, eq(investor.id, investorInvitation.investorId))
        .where(eq(investorInvitation.issuanceId, issuanceId))
        .orderBy(asc(investor.legalName));
    });
  }

  async invite(issuanceId: string, investorId: string) {
    const actor = currentUser();
    return withCurrentTenant(this.db, async (tx, tenantId) => {
      const found = await this.issuances.find(tx, issuanceId, true);
      if (!acceptsInvitations(found.issuance.status as IssuanceStatus)) {
        throw new AppError('INVALID_STATE_TRANSITION');
      }
      const [existing] = await tx
        .select()
        .from(investorInvitation)
        .where(
          and(
            eq(investorInvitation.issuanceId, issuanceId),
            eq(investorInvitation.investorId, investorId),
          ),
        );
      if (existing?.status === 'INVITED') {
        throw new AppError('VALIDATION_FAILED', [{ code: 'ALREADY_INVITED', field: 'investorId' }]);
      }
      // The maximum number of investors limits the subscribers: it is checked at subscription.
      const assessment = await this.eligibility.requireEligible(tx, tenantId, {
        investorId,
        issuanceId,
        ruleSet: { ...ruleSetOf(found.rules), maxInvestors: null },
        context: 'INVITATION',
      });
      const values = {
        status: 'INVITED' as const,
        eligibilityAssessmentId: assessment.id,
        invitedBy: actor.userId,
        invitedAt: new Date(),
        revokedBy: null,
        revokedAt: null,
      };
      const [invitation] = existing
        ? await tx
            .update(investorInvitation)
            .set({ ...values, updatedAt: new Date() })
            .where(eq(investorInvitation.id, existing.id))
            .returning()
        : await tx
            .insert(investorInvitation)
            .values({ ...values, tenantId, issuanceId, investorId, createdBy: actor.userId })
            .returning();
      await this.audit.recordIn(tx, {
        tenantId,
        action: 'INVESTOR_INVITED_TO_ISSUANCE',
        resourceType: 'issuance',
        resourceId: issuanceId,
        newValue: { investorId, invitationId: invitation!.id, assessmentId: assessment.id },
        result: 'SUCCESS',
      });
      await this.outbox.publish(tx, {
        tenantId,
        eventType: ISSUANCE_EVENTS.investorInvited,
        aggregateType: 'investor_invitation',
        aggregateId: invitation!.id,
        payload: { code: found.issuance.code, investorId, issuanceId },
      });
      return invitation!;
    });
  }

  /** Logical revocation (the invitation stays in the history). */
  async revoke(issuanceId: string, invitationId: string) {
    const actor = currentUser();
    return withCurrentTenant(this.db, async (tx, tenantId) => {
      await this.issuances.find(tx, issuanceId);
      const [existing] = await tx
        .select()
        .from(investorInvitation)
        .where(
          and(
            eq(investorInvitation.id, invitationId),
            eq(investorInvitation.issuanceId, issuanceId),
          ),
        );
      if (!existing) throw new AppError('RESOURCE_NOT_FOUND');
      if (existing.status === 'REVOKED') throw new AppError('INVALID_STATE_TRANSITION');
      const [revoked] = await tx
        .update(investorInvitation)
        .set({
          status: 'REVOKED',
          revokedBy: actor.userId,
          revokedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(investorInvitation.id, invitationId))
        .returning();
      await this.audit.recordIn(tx, {
        tenantId,
        action: 'INVESTOR_INVITATION_REVOKED',
        resourceType: 'issuance',
        resourceId: issuanceId,
        oldValue: { invitationId, status: 'INVITED' },
        newValue: { invitationId, status: 'REVOKED' },
        result: 'SUCCESS',
      });
      return revoked!;
    });
  }
}
