'use client';

import { CircleCheck, CircleX } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

const VALUE_LABELS: Record<string, string> = {
  kycStatus: 'status.kyc',
  profileStatus: 'investors.profileStatus',
  classification: 'investors.classification',
  investorType: 'investors.type',
};

export interface RuleOutcome {
  code: string;
  passed: boolean;
  detail?: Record<string, string | number | null>;
}

/**
 * Result of the eligibility engine in plain language (SPEC §8.4, EligibilityResult of
 * docs/ARCHITECTURE.md): every rule checked, passed or failed, with the values that explain it.
 */
export function EligibilityResult({
  result,
  rules,
}: {
  result: 'ELIGIBLE' | 'NOT_ELIGIBLE';
  rules: readonly RuleOutcome[];
}) {
  const t = useTranslations();
  const failed = rules.filter((rule) => !rule.passed);
  /** Codes shown with their translated label rather than as codes. */
  const valueLabel = (key: string, value: string | number | null): string | number => {
    if (value === null) return '—';
    const namespace = VALUE_LABELS[key];
    return namespace && t.has(`${namespace}.${value}`) ? t(`${namespace}.${value}`) : value;
  };
  return (
    <div className="flex flex-col gap-3" role="group" aria-label={t('eligibility.resultTitle')}>
      <p
        className={cn(
          'flex items-center gap-2 font-semibold',
          result === 'ELIGIBLE' ? 'text-success' : 'text-error-text',
        )}
      >
        {result === 'ELIGIBLE' ? (
          <CircleCheck aria-hidden="true" className="size-5" />
        ) : (
          <CircleX aria-hidden="true" className="size-5" />
        )}
        {result === 'ELIGIBLE'
          ? t('eligibility.eligible')
          : t('eligibility.notEligible', { count: failed.length })}
      </p>
      <ul className="flex flex-col gap-2 text-sm">
        {/* Failed rules first: they are what the user must act on. */}
        {[...failed, ...rules.filter((rule) => rule.passed)].map((rule) => (
          <li key={rule.code} className="flex gap-2">
            {rule.passed ? (
              <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
            ) : (
              <CircleX aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-error-text" />
            )}
            <span>
              <span className="sr-only">
                {rule.passed ? t('eligibility.passed') : t('eligibility.failed')}{' '}
              </span>
              {rule.passed
                ? t(`eligibilityChecks.${rule.code}`)
                : t(`eligibilityRules.${rule.code}`)}
              {rule.detail && Object.keys(rule.detail).length > 0 ? (
                <span className="block text-xs text-muted">
                  {Object.entries(rule.detail)
                    .map(([key, value]) =>
                      t.has(`eligibility.details.${key}`)
                        ? t(`eligibility.details.${key}`, { value: valueLabel(key, value) })
                        : `${key}: ${valueLabel(key, value)}`,
                    )
                    .join(' · ')}
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
