'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { IssuanceWizardStep } from '@veris/shared';
import { CircleAlert, CircleCheck } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { ApiError } from '@/components/app/api-error';
import { ConfirmDialog } from '@/components/app/confirm-dialog';
import { Button } from '@/components/ui/button';
import { useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api/client';
import { useIdempotencyKey } from '@/lib/api/idempotency';
import { formatAmount, formatBusinessDate, formatRate } from '../format';
import type { IssuanceCheck } from '../types';
import type { StepProps } from './issuance-wizard';

/** The wizard step where a field is typed, to take the user back to it. */
function stepOf(field: string | null): IssuanceWizardStep {
  if (!field) return 'GENERAL';
  if (field.startsWith('eligibilityRules.')) return 'ELIGIBILITY';
  if (field === 'terms.dayCount') return 'SERVICING';
  if (field.startsWith('terms.')) return 'FINANCIAL';
  return 'GENERAL';
}

/** Step 6: summary, remaining checks of SPEC §6.3, submission. */
export function ReviewStep(
  props: StepProps & {
    checks: { consistent: boolean; failures: IssuanceCheck[] } | undefined;
    canSubmit: boolean;
    onEdit: (step: IssuanceWizardStep) => void;
  },
) {
  const t = useTranslations('issuances');
  const tRules = useTranslations('issuanceTermsRules');
  const locale = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();
  const idempotency = useIdempotencyKey();
  const { issuance, checks } = props;
  const { terms, eligibilityRules: rules } = issuance;
  useEffect(() => props.registerFlush(() => Promise.resolve(undefined)), [props]);

  const submit = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST('/api/v1/issuances/{id}/submit', {
        params: { path: { id: issuance.id }, header: idempotency.header() },
      });
      idempotency.answered();
      if (error) throw error;
      return data;
    },
    onSuccess: async (updated) => {
      queryClient.setQueryData(['issuance', issuance.id], updated);
      await queryClient.invalidateQueries({ queryKey: ['issuances'] });
      router.push(`/issuer/issuances/${issuance.id}`);
    },
  });

  const money = (value: string | null) => formatAmount(value, issuance.currency, locale);
  const rows: [string, string][] = [
    [t('fields.name'), `${issuance.name} (${issuance.code})`],
    [
      t('fields.assetCategory'),
      issuance.assetCategory ? t(`categories.${issuance.assetCategory}`) : '—',
    ],
    [t('fields.legalIssuerName'), issuance.legalIssuerName ?? '—'],
    [t('fields.nominalValue'), money(terms.nominalValue)],
    [t('fields.totalUnits'), terms.totalUnits ?? '—'],
    [t('fields.targetAmount'), money(terms.targetAmount)],
    [t('fields.minimumAmount'), money(terms.minimumAmount)],
    [t('fields.maximumAmount'), money(terms.maximumAmount)],
    [t('fields.ratePercent'), formatRate(terms.interestRate, locale)],
    [
      t('fields.distributionFrequency'),
      terms.distributionFrequency ? t(`frequencies.${terms.distributionFrequency}`) : '—',
    ],
    [
      t('columns.window'),
      `${formatBusinessDate(terms.subscriptionStartDate, locale)} → ${formatBusinessDate(terms.subscriptionEndDate, locale)}`,
    ],
    [t('fields.issueDate'), formatBusinessDate(terms.issueDate, locale)],
    [t('fields.maturityDate'), formatBusinessDate(terms.maturityDate, locale)],
    [t('fields.minSubscriptionAmount'), money(terms.minSubscriptionAmount)],
    [t('fields.maxAmountPerInvestor'), money(terms.maxAmountPerInvestor)],
    [t('fields.excludedCountries'), rules.excludedCountries.join(', ') || '—'],
    [t('fields.kycMinRemainingValidityDays'), String(rules.kycMinRemainingValidityDays)],
  ];

  return (
    <div className="flex flex-col gap-5">
      <h2 className="font-heading text-lg font-semibold">{t('wizard.stepNames.REVIEW')}</h2>
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3 border-b border-border py-1">
            <dt className="text-muted">{label}</dt>
            <dd className="text-right tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <section aria-labelledby="checks-title" className="flex flex-col gap-2">
        <h3 id="checks-title" className="text-sm font-semibold">
          {t('wizard.checks')}
        </h3>
        {checks?.consistent ? (
          <p className="flex items-center gap-2 text-sm text-success">
            <CircleCheck aria-hidden="true" className="size-4" />
            {t('wizard.consistent')}
          </p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {(checks?.failures ?? []).map((failure, index) => (
              <li
                key={`${failure.code}-${failure.field ?? index}`}
                className="flex items-start gap-2"
              >
                <CircleAlert
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-error-text"
                />
                <span>
                  {tRules(failure.code)}
                  {failure.field ? (
                    <span className="text-muted">
                      {' '}
                      · {t(`fieldNames.${failure.field.replace('.', '_')}`)}
                    </span>
                  ) : null}{' '}
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto px-0"
                    onClick={() => props.onEdit(stepOf(failure.field))}
                  >
                    {t('wizard.fix')}
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      {submit.isError ? <ApiError error={submit.error} /> : null}
      {props.canSubmit ? (
        <ConfirmDialog
          trigger={
            <Button className="self-start" disabled={!checks?.consistent}>
              {t('actions.submit')}
            </Button>
          }
          title={t('actions.submitTitle')}
          description={t('actions.submitDescription')}
          confirmLabel={t('actions.submit')}
          onConfirm={() => submit.mutateAsync()}
        />
      ) : null}
    </div>
  );
}
