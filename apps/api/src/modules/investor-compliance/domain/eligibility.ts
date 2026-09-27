import {
  addDays,
  type BusinessDate,
  type EligibilityRuleCode,
  type EligibilityStatus,
  type InvestorClassification,
  type InvestorType,
  type KycStatus,
  type ProfileStatus,
} from '@veris/shared';

/**
 * Eligibility engine (SPEC §8.4): a pure function — the same facts always give the same result —
 * that evaluates every rule and returns each one, passed or failed, with its code. It is called at
 * invitation, subscription and transfer time; nothing here reads a clock or a database.
 */
export const ELIGIBILITY_ENGINE_VERSION = 'engine-1';

/** Classifications counted as professional investors (MiFID II: professional clients and ECPs). */
const PROFESSIONAL_CLASSIFICATIONS: readonly InvestorClassification[] = [
  'PROFESSIONAL',
  'ELIGIBLE_COUNTERPARTY',
];

/** What the engine needs to know about the investor. */
export interface EligibilityInvestor {
  type: InvestorType;
  classification: InvestorClassification;
  countryOfIncorporation: string;
  profileStatus: ProfileStatus;
  kycStatus: KycStatus;
  kycExpiryDate: BusinessDate | null;
  /** Decision of a Compliance Officer (SUSPENDED and NOT_ELIGIBLE block every issuance). */
  eligibilityStatus: EligibilityStatus;
}

/**
 * Eligibility rules of an issuance (SPEC §6.2 step 3, docs/DATA_MODEL.md §3.4). Empty lists mean
 * "no restriction".
 */
export interface EligibilityRuleSet {
  professionalOnly: boolean;
  allowedCountries: readonly string[];
  excludedCountries: readonly string[];
  allowedInvestorTypes: readonly InvestorType[];
  allowedClassifications: readonly InvestorClassification[];
  kycRequired: boolean;
  /** The KYC/KYB must still be valid this many days after today (0: valid today). */
  kycMinRemainingValidityDays: number;
  /** Null: no limit. */
  maxInvestors: number | null;
  /** Incremented at each change of the rule set, recorded with every decision. */
  rulesVersion: number;
}

export interface EligibilityContext {
  /** Today in the tenant's time zone (decision D-015). */
  today: BusinessDate;
  /** Investors already holding or subscribing to the issuance (for the maximum). */
  currentInvestorCount: number;
  /** The investor is already one of them: the maximum does not apply to it. */
  alreadyInvestor: boolean;
}

/** Values explaining a rule's outcome, shown to the user in plain language. */
export type RuleDetail = Readonly<Record<string, string | number | null>>;

export interface RuleOutcome {
  code: EligibilityRuleCode;
  passed: boolean;
  detail?: RuleDetail;
}

export interface EligibilityResult {
  result: 'ELIGIBLE' | 'NOT_ELIGIBLE';
  rules: RuleOutcome[];
  /** `engine-1/rules-3`: the engine and rule set versions that gave this result. */
  rulesVersion: string;
}

function rule(code: EligibilityRuleCode, passed: boolean, detail?: RuleDetail): RuleOutcome {
  return detail ? { code, passed, detail } : { code, passed };
}

export function evaluateEligibility(
  investor: EligibilityInvestor,
  rules: EligibilityRuleSet,
  context: EligibilityContext,
): EligibilityResult {
  const outcomes: RuleOutcome[] = [
    rule('PROFILE_INACTIVE', investor.profileStatus === 'ACTIVE', {
      profileStatus: investor.profileStatus,
    }),
    rule('INVESTOR_SUSPENDED', investor.eligibilityStatus !== 'SUSPENDED'),
    rule('INVESTOR_NOT_ELIGIBLE', investor.eligibilityStatus !== 'NOT_ELIGIBLE'),
  ];

  if (rules.kycRequired) {
    // An expired approval was approved: it fails on expiry, not on approval.
    const approved = investor.kycStatus === 'APPROVED' || investor.kycStatus === 'EXPIRED';
    outcomes.push(rule('KYC_NOT_APPROVED', approved, { kycStatus: investor.kycStatus }));
    if (approved) {
      const expiry = investor.kycExpiryDate;
      const expired = investor.kycStatus === 'EXPIRED' || expiry === null || expiry < context.today;
      outcomes.push(rule('KYC_EXPIRED', !expired, { expiryDate: expiry }));
      if (!expired && rules.kycMinRemainingValidityDays > 0) {
        const requiredUntil = addDays(context.today, rules.kycMinRemainingValidityDays);
        outcomes.push(
          rule('KYC_EXPIRES_TOO_SOON', expiry >= requiredUntil, {
            expiryDate: expiry,
            requiredUntil,
          }),
        );
      }
    }
  }

  if (rules.professionalOnly) {
    outcomes.push(
      rule('NOT_PROFESSIONAL', PROFESSIONAL_CLASSIFICATIONS.includes(investor.classification), {
        classification: investor.classification,
      }),
    );
  }
  if (rules.allowedClassifications.length > 0) {
    outcomes.push(
      rule(
        'CLASSIFICATION_INCOMPATIBLE',
        rules.allowedClassifications.includes(investor.classification),
        {
          classification: investor.classification,
        },
      ),
    );
  }
  if (rules.allowedInvestorTypes.length > 0) {
    outcomes.push(
      rule('INVESTOR_TYPE_NOT_ALLOWED', rules.allowedInvestorTypes.includes(investor.type), {
        investorType: investor.type,
      }),
    );
  }

  const country = investor.countryOfIncorporation;
  outcomes.push(rule('COUNTRY_EXCLUDED', !rules.excludedCountries.includes(country), { country }));
  if (rules.allowedCountries.length > 0) {
    outcomes.push(
      rule('COUNTRY_NOT_ALLOWED', rules.allowedCountries.includes(country), { country }),
    );
  }

  if (rules.maxInvestors !== null && !context.alreadyInvestor) {
    outcomes.push(
      rule('MAX_INVESTORS_REACHED', context.currentInvestorCount < rules.maxInvestors, {
        maxInvestors: rules.maxInvestors,
        currentInvestorCount: context.currentInvestorCount,
      }),
    );
  }

  return {
    result: outcomes.every((outcome) => outcome.passed) ? 'ELIGIBLE' : 'NOT_ELIGIBLE',
    rules: outcomes,
    rulesVersion: `${ELIGIBILITY_ENGINE_VERSION}/rules-${rules.rulesVersion}`,
  };
}

/** Codes of the failed rules, in evaluation order (for error details). */
export function failedRuleCodes(result: EligibilityResult): EligibilityRuleCode[] {
  return result.rules.filter((outcome) => !outcome.passed).map((outcome) => outcome.code);
}
