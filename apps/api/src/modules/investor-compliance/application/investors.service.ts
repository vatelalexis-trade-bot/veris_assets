import { randomInt } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type {
  InvestorClassification,
  InvestorType,
  KycStatus,
  ProfileStatus,
} from '@virtus/shared';
import { and, asc, count, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import { AuditWriter } from '../../../core/audit/audit-writer.js';
import { changedValues } from '../../../core/audit/changed-values.js';
import { currentUser } from '../../../core/context/request-context.js';
import {
  DATABASE,
  type Database,
  type Transaction,
  withCurrentTenant,
} from '../../../core/database/database.js';
import { AppError } from '../../../core/errors/app-error.js';
import { offsetOf, type Page, type Pagination } from '../../../core/http/pagination.js';
import { recipientCodeFrom } from '../domain/recipient-code.js';
import {
  beneficialOwner,
  complianceComment,
  investor,
  investorRepresentative,
  kycCase,
} from '../infrastructure/schema.js';

export type InvestorRow = typeof investor.$inferSelect;
export type RepresentativeRow = typeof investorRepresentative.$inferSelect;
export type BeneficialOwnerRow = typeof beneficialOwner.$inferSelect;
export type ComplianceCommentRow = typeof complianceComment.$inferSelect;

export interface Address {
  line1: string;
  line2?: string | null;
  postalCode: string;
  city: string;
  countryCode: string;
}

export interface InvestorInput {
  type: InvestorType;
  legalName: string;
  tradeName?: string | null;
  legalForm?: string | null;
  registrationNumber?: string | null;
  taxId?: string | null;
  countryOfIncorporation: string;
  address?: Address | null;
  contactEmail?: string | null;
  phone?: string | null;
  classification: InvestorClassification;
  profileStatus?: ProfileStatus;
}

/** What an investor may change in its own profile from the portal (SPEC §4.5). */
export interface OwnProfileInput {
  tradeName?: string | null;
  address?: Address | null;
  contactEmail?: string | null;
  phone?: string | null;
}

export interface InvestorFilters {
  q?: string;
  kycStatus?: KycStatus;
  profileStatus?: ProfileStatus;
}

export interface PersonInput {
  fullName: string;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  dateOfBirth?: string | null;
}

export interface BeneficialOwnerInput {
  fullName: string;
  nationality?: string | null;
  /** Decimal string, e.g. "25.50". */
  ownershipPercentage: string;
  dateOfBirth?: string | null;
}

/** Personal fields masked in the audit log on top of the common list (SPEC §8.5). */
const PERSONAL_KEYS = ['fullName', 'title', 'nationality'];
const UNIQUE_VIOLATION = '23505';
const CODE_ATTEMPTS = 5;

function randomRecipientCode(): string {
  return recipientCodeFrom(Array.from({ length: 8 }, () => randomInt(0, 32)));
}

function isUniqueViolation(error: unknown): boolean {
  const candidate = error as { code?: unknown; cause?: { code?: unknown } };
  return (candidate.cause?.code ?? candidate.code) === UNIQUE_VIOLATION;
}

/**
 * Investor profiles (SPEC §8.1), their representatives and beneficial owners [DP], and the
 * compliance comments. Every query runs in the session's tenant (row level security).
 */
@Injectable()
export class InvestorsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly audit: AuditWriter,
  ) {}

  async list(filters: InvestorFilters, pagination: Pagination): Promise<Page<InvestorRow>> {
    const conditions: SQL[] = [];
    if (filters.q) {
      // % and _ typed by the user are searched literally.
      const pattern = `%${filters.q.replace(/[\\%_]/g, '\\$&')}%`;
      conditions.push(or(ilike(investor.legalName, pattern), ilike(investor.tradeName, pattern))!);
    }
    if (filters.kycStatus) conditions.push(eq(investor.kycStatus, filters.kycStatus));
    if (filters.profileStatus) conditions.push(eq(investor.profileStatus, filters.profileStatus));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    return withCurrentTenant(this.db, async (tx) => {
      const [{ total } = { total: 0 }] = await tx
        .select({ total: count() })
        .from(investor)
        .where(where);
      const data = await tx
        .select()
        .from(investor)
        .where(where)
        .orderBy(asc(investor.legalName), asc(investor.id))
        .limit(pagination.pageSize)
        .offset(offsetOf(pagination));
      return { data, meta: { ...pagination, total } };
    });
  }

  get(id: string): Promise<InvestorRow> {
    return withCurrentTenant(this.db, (tx) => this.find(tx, id));
  }

  /** In the caller's transaction; 404 for an unknown investor or one of another tenant. */
  async find(tx: Transaction, id: string): Promise<InvestorRow> {
    const [found] = await tx.select().from(investor).where(eq(investor.id, id));
    if (!found) throw new AppError('RESOURCE_NOT_FOUND');
    return found;
  }

  async exists(tx: Transaction, id: string): Promise<boolean> {
    const [found] = await tx.select({ id: investor.id }).from(investor).where(eq(investor.id, id));
    return found !== undefined;
  }

  async create(input: InvestorInput): Promise<InvestorRow> {
    const actor = currentUser();
    return withCurrentTenant(this.db, async (tx, tenantId) => {
      const created = await this.withNewRecipientCode(tx, (recipientCode, savepoint) =>
        savepoint
          .insert(investor)
          .values({
            ...input,
            address: input.address ?? null,
            tenantId,
            recipientCode,
            createdBy: actor.userId,
          })
          .returning(),
      );
      await this.audit.recordIn(tx, {
        tenantId,
        action: 'INVESTOR_CREATED',
        resourceType: 'investor',
        resourceId: created.id,
        newValue: { ...input },
        result: 'SUCCESS',
      });
      return created;
    });
  }

  async update(id: string, version: number, changes: Partial<InvestorInput>): Promise<InvestorRow> {
    return withCurrentTenant(this.db, async (tx, tenantId) => {
      const before = await this.find(tx, id);
      if (before.version !== version) throw new AppError('VERSION_CONFLICT');
      const updated = await this.write(tx, id, version, changes);
      await this.audit.recordIn(tx, {
        tenantId,
        action: 'INVESTOR_UPDATED',
        resourceType: 'investor',
        resourceId: id,
        ...changedValues(before, changes),
        result: 'SUCCESS',
      });
      return updated;
    });
  }

  /** The profile of the signed-in investor (portal). */
  me(): Promise<InvestorRow> {
    return withCurrentTenant(this.db, (tx) => this.find(tx, this.ownInvestorId()));
  }

  async updateOwnProfile(version: number, changes: OwnProfileInput): Promise<InvestorRow> {
    const id = this.ownInvestorId();
    return withCurrentTenant(this.db, async (tx, tenantId) => {
      const before = await this.find(tx, id);
      if (before.version !== version) throw new AppError('VERSION_CONFLICT');
      const updated = await this.write(tx, id, version, changes);
      await this.audit.recordIn(tx, {
        tenantId,
        action: 'INVESTOR_PROFILE_UPDATED',
        resourceType: 'investor',
        resourceId: id,
        ...changedValues(before, changes),
        result: 'SUCCESS',
      });
      return updated;
    });
  }

  /** A new recipient code; the old one stops working at once (D-010). */
  async regenerateRecipientCode(): Promise<InvestorRow> {
    const id = this.ownInvestorId();
    return withCurrentTenant(this.db, async (tx, tenantId) => {
      const before = await this.find(tx, id);
      const updated = await this.withNewRecipientCode(tx, (recipientCode, savepoint) =>
        savepoint
          .update(investor)
          .set({ recipientCode, version: sql`${investor.version} + 1`, updatedAt: new Date() })
          .where(eq(investor.id, id))
          .returning(),
      );
      await this.audit.recordIn(tx, {
        tenantId,
        action: 'INVESTOR_RECIPIENT_CODE_REGENERATED',
        resourceType: 'investor',
        resourceId: id,
        oldValue: { recipientCode: before.recipientCode },
        newValue: { recipientCode: updated.recipientCode },
        result: 'SUCCESS',
      });
      return updated;
    });
  }

  // Representatives and beneficial owners [DP]

  representatives(investorId: string): Promise<RepresentativeRow[]> {
    return withCurrentTenant(this.db, async (tx) => {
      await this.find(tx, investorId);
      return tx
        .select()
        .from(investorRepresentative)
        .where(eq(investorRepresentative.investorId, investorId))
        .orderBy(asc(investorRepresentative.createdAt));
    });
  }

  async addRepresentative(investorId: string, input: PersonInput): Promise<RepresentativeRow> {
    return withCurrentTenant(this.db, async (tx, tenantId) => {
      await this.find(tx, investorId);
      const [created] = await tx
        .insert(investorRepresentative)
        .values({ ...input, investorId, tenantId, createdBy: currentUser().userId })
        .returning();
      await this.audit.recordIn(tx, {
        tenantId,
        action: 'INVESTOR_REPRESENTATIVE_ADDED',
        resourceType: 'investor',
        resourceId: investorId,
        newValue: { representativeId: created!.id, ...input },
        personalKeys: PERSONAL_KEYS,
        result: 'SUCCESS',
      });
      return created!;
    });
  }

  async updateRepresentative(
    investorId: string,
    representativeId: string,
    changes: Partial<PersonInput>,
  ): Promise<RepresentativeRow> {
    return withCurrentTenant(this.db, async (tx, tenantId) => {
      const [before] = await tx
        .select()
        .from(investorRepresentative)
        .where(
          and(
            eq(investorRepresentative.id, representativeId),
            eq(investorRepresentative.investorId, investorId),
          ),
        );
      if (!before) throw new AppError('RESOURCE_NOT_FOUND');
      const [updated] = await tx
        .update(investorRepresentative)
        .set({
          ...changes,
          version: sql`${investorRepresentative.version} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(investorRepresentative.id, representativeId))
        .returning();
      await this.audit.recordIn(tx, {
        tenantId,
        action: 'INVESTOR_REPRESENTATIVE_UPDATED',
        resourceType: 'investor',
        resourceId: investorId,
        ...changedValues(before, changes),
        personalKeys: PERSONAL_KEYS,
        result: 'SUCCESS',
      });
      return updated!;
    });
  }

  beneficialOwners(investorId: string): Promise<BeneficialOwnerRow[]> {
    return withCurrentTenant(this.db, async (tx) => {
      await this.find(tx, investorId);
      return tx
        .select()
        .from(beneficialOwner)
        .where(eq(beneficialOwner.investorId, investorId))
        .orderBy(desc(beneficialOwner.ownershipPercentage));
    });
  }

  async addBeneficialOwner(
    investorId: string,
    input: BeneficialOwnerInput,
  ): Promise<BeneficialOwnerRow> {
    return withCurrentTenant(this.db, async (tx, tenantId) => {
      await this.find(tx, investorId);
      const [created] = await tx
        .insert(beneficialOwner)
        .values({ ...input, investorId, tenantId, createdBy: currentUser().userId })
        .returning();
      await this.audit.recordIn(tx, {
        tenantId,
        action: 'INVESTOR_BENEFICIAL_OWNER_ADDED',
        resourceType: 'investor',
        resourceId: investorId,
        newValue: { beneficialOwnerId: created!.id, ...input },
        personalKeys: PERSONAL_KEYS,
        result: 'SUCCESS',
      });
      return created!;
    });
  }

  async updateBeneficialOwner(
    investorId: string,
    ownerId: string,
    changes: Partial<BeneficialOwnerInput>,
  ): Promise<BeneficialOwnerRow> {
    return withCurrentTenant(this.db, async (tx, tenantId) => {
      const [before] = await tx
        .select()
        .from(beneficialOwner)
        .where(and(eq(beneficialOwner.id, ownerId), eq(beneficialOwner.investorId, investorId)));
      if (!before) throw new AppError('RESOURCE_NOT_FOUND');
      const [updated] = await tx
        .update(beneficialOwner)
        .set({ ...changes, version: sql`${beneficialOwner.version} + 1`, updatedAt: new Date() })
        .where(eq(beneficialOwner.id, ownerId))
        .returning();
      await this.audit.recordIn(tx, {
        tenantId,
        action: 'INVESTOR_BENEFICIAL_OWNER_UPDATED',
        resourceType: 'investor',
        resourceId: investorId,
        ...changedValues(before, changes),
        personalKeys: PERSONAL_KEYS,
        result: 'SUCCESS',
      });
      return updated!;
    });
  }

  // Compliance comments (SPEC §4.4), append-only

  comments(investorId: string): Promise<ComplianceCommentRow[]> {
    return withCurrentTenant(this.db, async (tx) => {
      await this.find(tx, investorId);
      return tx
        .select()
        .from(complianceComment)
        .where(eq(complianceComment.investorId, investorId))
        .orderBy(desc(complianceComment.createdAt));
    });
  }

  async addComment(
    investorId: string,
    input: { body: string; resourceType?: 'investor' | 'kyc_case'; resourceId?: string },
  ): Promise<ComplianceCommentRow> {
    return withCurrentTenant(this.db, async (tx, tenantId) => {
      await this.find(tx, investorId);
      if (input.resourceType === 'kyc_case') {
        // The case must be one of this investor's cases.
        const [found] = await tx
          .select({ id: kycCase.id })
          .from(kycCase)
          .where(and(eq(kycCase.id, input.resourceId!), eq(kycCase.investorId, investorId)));
        if (!found) throw new AppError('RESOURCE_NOT_FOUND');
      }
      const [created] = await tx
        .insert(complianceComment)
        .values({
          tenantId,
          investorId,
          resourceType: input.resourceType ?? 'investor',
          resourceId: input.resourceId ?? investorId,
          authorUserId: currentUser().userId,
          body: input.body,
        })
        .returning();
      await this.audit.recordIn(tx, {
        tenantId,
        action: 'COMPLIANCE_COMMENT_ADDED',
        resourceType: input.resourceType ?? 'investor',
        resourceId: input.resourceId ?? investorId,
        newValue: { commentId: created!.id },
        result: 'SUCCESS',
      });
      return created!;
    });
  }

  private ownInvestorId(): string {
    const { investorId } = currentUser();
    // An account with the Investor role but no profile yet: nothing to show.
    if (!investorId) throw new AppError('RESOURCE_NOT_FOUND');
    return investorId;
  }

  private async write(
    tx: Transaction,
    id: string,
    version: number,
    changes: Partial<InvestorInput> | OwnProfileInput,
  ): Promise<InvestorRow> {
    const [updated] = await tx
      .update(investor)
      .set({ ...changes, version: sql`${investor.version} + 1`, updatedAt: new Date() })
      .where(and(eq(investor.id, id), eq(investor.version, version)))
      .returning();
    if (!updated) throw new AppError('VERSION_CONFLICT');
    return updated;
  }

  /** Runs `write` with a new random code, again with another code if it is already taken. */
  private async withNewRecipientCode(
    tx: Transaction,
    write: (code: string, savepoint: Transaction) => Promise<InvestorRow[]>,
  ): Promise<InvestorRow> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        // A savepoint, so that a taken code does not abort the whole transaction.
        const [row] = await tx.transaction((savepoint) => write(randomRecipientCode(), savepoint));
        return row!;
      } catch (error) {
        if (!isUniqueViolation(error) || attempt >= CODE_ATTEMPTS) throw error;
      }
    }
  }
}
