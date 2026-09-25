import {
  CURRENCY_MINOR_UNITS,
  isCurrencyCode,
  isDecimalString,
  parseDecimal,
  type IssuanceTermsRuleCode,
} from '@virtus/shared';

/** Terms as stored: decimals as strings, dates as `YYYY-MM-DD`, null while not filled in. */
export interface TermsToCheck {
  targetAmount: string | null;
  minimumAmount: string | null;
  maximumAmount: string | null;
  nominalValue: string | null;
  totalUnits: string | null;
  interestRate: string | null;
  rateType: string | null;
  distributionFrequency: string | null;
  dayCount: string | null;
  issueDate: string | null;
  maturityDate: string | null;
  subscriptionStartDate: string | null;
  subscriptionEndDate: string | null;
  minSubscriptionAmount: string | null;
  maxAmountPerInvestor: string | null;
}

export interface IssuanceToCheck {
  name: string | null;
  code: string | null;
  assetCategory: string | null;
  countryCode: string | null;
  currency: string | null;
  legalIssuerName: string | null;
  terms: TermsToCheck;
  allowedCountries: readonly string[];
  excludedCountries: readonly string[];
}

export interface CheckFailure {
  code: IssuanceTermsRuleCode;
  /** Field concerned, as named in the API (e.g. `terms.targetAmount`). */
  field?: string;
}

const SUPPORTED_FREQUENCIES = ['MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL', 'BULLET'];
const AMOUNTS = [
  'targetAmount',
  'minimumAmount',
  'maximumAmount',
  'nominalValue',
  'minSubscriptionAmount',
  'maxAmountPerInvestor',
] as const;

/**
 * Consistency checks of an issuance before it is submitted (SPEC §6.3), also shown in the wizard.
 * Pure: every failure is returned, in a stable order; amounts are compared as decimals.
 */
export function checkIssuance(issuance: IssuanceToCheck): CheckFailure[] {
  const failures: CheckFailure[] = [];
  const terms = issuance.terms;
  const missing = (field: string, value: unknown) => {
    if (value === null || value === undefined || value === '') {
      failures.push({ code: 'REQUIRED_FIELD_MISSING', field });
      return true;
    }
    return false;
  };

  for (const field of [
    'name',
    'code',
    'assetCategory',
    'countryCode',
    'currency',
    'legalIssuerName',
  ] as const) {
    missing(field, issuance[field]);
  }
  for (const [field, value] of Object.entries(terms)) missing(`terms.${field}`, value);

  // Amounts: decimals, positive, with no more decimals than the currency allows.
  const decimals =
    issuance.currency && isCurrencyCode(issuance.currency)
      ? CURRENCY_MINOR_UNITS[issuance.currency]
      : null;
  for (const field of AMOUNTS) {
    const value = terms[field];
    if (
      value &&
      isDecimalString(value) &&
      decimals !== null &&
      parseDecimal(value).decimalPlaces() > decimals
    ) {
      failures.push({ code: 'AMOUNT_TOO_PRECISE', field: `terms.${field}` });
    }
  }
  const amount = (value: string | null) =>
    value && isDecimalString(value) ? parseDecimal(value) : null;
  const target = amount(terms.targetAmount);
  const minimum = amount(terms.minimumAmount);
  const maximum = amount(terms.maximumAmount);
  const nominal = amount(terms.nominalValue);
  const units = amount(terms.totalUnits);

  if (units && (!units.isInteger() || units.lte(0))) {
    failures.push({ code: 'UNITS_NOT_INTEGER', field: 'terms.totalUnits' });
  }
  if (target && nominal && units && !target.equals(nominal.times(units))) {
    failures.push({ code: 'TARGET_NOT_EQUAL_NOMINAL_TIMES_UNITS', field: 'terms.targetAmount' });
  }
  if (target && minimum && maximum && !(minimum.lte(target) && target.lte(maximum))) {
    failures.push({ code: 'MIN_TARGET_MAX_ORDER', field: 'terms.minimumAmount' });
  }
  const minSubscription = amount(terms.minSubscriptionAmount);
  const maxPerInvestor = amount(terms.maxAmountPerInvestor);
  if (minSubscription && maxPerInvestor && minSubscription.greaterThan(maxPerInvestor)) {
    failures.push({
      code: 'MIN_SUBSCRIPTION_ABOVE_MAX_PER_INVESTOR',
      field: 'terms.minSubscriptionAmount',
    });
  }

  // Dates: subscription start < subscription end <= issue date < maturity.
  const { subscriptionStartDate: start, subscriptionEndDate: end, issueDate, maturityDate } = terms;
  if (
    start &&
    end &&
    issueDate &&
    maturityDate &&
    !(start < end && end <= issueDate && issueDate < maturityDate)
  ) {
    failures.push({ code: 'DATE_ORDER_INVALID', field: 'terms.subscriptionStartDate' });
  }

  const both = issuance.allowedCountries.filter((country) =>
    issuance.excludedCountries.includes(country),
  );
  if (both.length > 0) {
    failures.push({
      code: 'COUNTRY_BOTH_ALLOWED_AND_EXCLUDED',
      field: 'eligibilityRules.excludedCountries',
    });
  }

  const rate = amount(terms.interestRate);
  if (rate?.isNegative()) failures.push({ code: 'NEGATIVE_RATE', field: 'terms.interestRate' });
  if (terms.rateType && terms.rateType !== 'FIXED') {
    failures.push({ code: 'RATE_TYPE_NOT_SUPPORTED', field: 'terms.rateType' });
  }
  if (terms.distributionFrequency && !SUPPORTED_FREQUENCIES.includes(terms.distributionFrequency)) {
    failures.push({ code: 'FREQUENCY_NOT_SUPPORTED', field: 'terms.distributionFrequency' });
  }
  return failures;
}
