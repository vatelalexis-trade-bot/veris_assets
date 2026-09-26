import { isDecimalString, parseDecimal, type BusinessDate } from '@virtus/shared';

export type SubscriptionCheckCode =
  | 'SUBSCRIPTION_WINDOW_NOT_STARTED'
  | 'SUBSCRIPTION_WINDOW_CLOSED'
  | 'QUANTITY_NOT_INTEGER'
  | 'AMOUNT_UNITS_MISMATCH'
  | 'SUBSCRIPTION_BELOW_MINIMUM'
  | 'SUBSCRIPTION_LIMIT_EXCEEDED'
  | 'INSUFFICIENT_UNITS'
  | 'ISSUANCE_CAP_EXCEEDED';

export interface SubscriptionCheckInput {
  issuanceStatus: string;
  today: BusinessDate;
  subscriptionStartDate: BusinessDate | null;
  subscriptionEndDate: BusinessDate | null;
  nominalValue: string;
  totalUnits: string;
  maximumAmount: string | null;
  minSubscriptionAmount: string | null;
  maxAmountPerInvestor: string | null;
  requestedUnits: string;
  requestedAmount: string;
  /** Amounts of the investor's other active subscriptions to the issuance. */
  investorActiveAmount: string;
}

export interface SubscriptionCheckFailure {
  code: SubscriptionCheckCode;
  /** Values explaining the refusal, shown to the investor. */
  meta?: Record<string, string>;
}

/**
 * Checks of a subscription when it is submitted (SPEC §9.3), in exact decimals; the first failure
 * is the reason of the refusal. Eligibility and the invitation are checked by the use case.
 * Oversubscription is allowed (SPEC §9.4, scenario 3): a single subscription may not exceed the
 * units or the maximum amount of the issuance, but their total may, and the allocation decides.
 */
export function checkSubscription(input: SubscriptionCheckInput): SubscriptionCheckFailure | null {
  if (input.issuanceStatus !== 'SUBSCRIPTION_OPEN') return { code: 'SUBSCRIPTION_WINDOW_CLOSED' };
  if (input.subscriptionStartDate && input.today < input.subscriptionStartDate) {
    return {
      code: 'SUBSCRIPTION_WINDOW_NOT_STARTED',
      meta: { startDate: input.subscriptionStartDate },
    };
  }
  if (input.subscriptionEndDate && input.today > input.subscriptionEndDate) {
    return { code: 'SUBSCRIPTION_WINDOW_CLOSED', meta: { endDate: input.subscriptionEndDate } };
  }
  if (!isDecimalString(input.requestedUnits)) return { code: 'QUANTITY_NOT_INTEGER' };
  const units = parseDecimal(input.requestedUnits);
  if (!units.isInteger() || units.lte(0)) return { code: 'QUANTITY_NOT_INTEGER' };

  const nominal = parseDecimal(input.nominalValue);
  const amount = parseDecimal(input.requestedAmount);
  const expected = nominal.times(units);
  if (!amount.equals(expected)) {
    return { code: 'AMOUNT_UNITS_MISMATCH', meta: { expectedAmount: expected.toString() } };
  }
  if (input.minSubscriptionAmount && amount.lessThan(parseDecimal(input.minSubscriptionAmount))) {
    return { code: 'SUBSCRIPTION_BELOW_MINIMUM', meta: { minimum: input.minSubscriptionAmount } };
  }
  if (input.maxAmountPerInvestor) {
    const total = parseDecimal(input.investorActiveAmount).plus(amount);
    if (total.greaterThan(parseDecimal(input.maxAmountPerInvestor))) {
      return {
        code: 'SUBSCRIPTION_LIMIT_EXCEEDED',
        meta: {
          maximum: input.maxAmountPerInvestor,
          alreadySubscribed: input.investorActiveAmount,
        },
      };
    }
  }
  if (units.greaterThan(parseDecimal(input.totalUnits))) {
    return { code: 'INSUFFICIENT_UNITS', meta: { totalUnits: input.totalUnits } };
  }
  if (input.maximumAmount && amount.greaterThan(parseDecimal(input.maximumAmount))) {
    return { code: 'ISSUANCE_CAP_EXCEEDED', meta: { maximum: input.maximumAmount } };
  }
  return null;
}
