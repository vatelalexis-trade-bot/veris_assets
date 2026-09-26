'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { ApiError } from '@/components/app/api-error';
import { FormField } from '@/components/app/form-field';
import { PageHeader } from '@/components/app/page-header';
import { StatusBadge } from '@/components/app/status-badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { EligibilityResult } from '@/features/eligibility/eligibility-result';
import { formatAmount, formatBusinessDate, formatRate } from '@/features/issuances/format';
import { DocumentsTab } from '@/features/issuances/issuance-detail';
import { failedRulesOf } from '@/features/issuances/invitations-tab';
import type { IssuanceView } from '@/features/issuances/types';
import { Link, useRouter } from '@/i18n/navigation';
import { api, errorCodeOf } from '@/lib/api/client';
import { useIdempotencyKey } from '@/lib/api/idempotency';
import { subscriptionAmount } from './amount';

/** An issuance the investor is invited to: its terms, documents and the subscription form. */
export function OpportunityDetail({ id, canSubscribe }: { id: string; canSubscribe: boolean }) {
  const t = useTranslations('subscriptions.opportunities');
  const tIssuances = useTranslations('issuances');
  const locale = useLocale();
  const issuance = useQuery({
    queryKey: ['issuance', id],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/issuances/{id}', { params: { path: { id } } });
      if (error) throw error;
      return data;
    },
  });
  if (issuance.isError) return <ApiError error={issuance.error} />;
  if (!issuance.data) return <Skeleton className="h-60 w-full" />;
  const current = issuance.data;
  const { terms } = current;
  const money = (value: string | null) => formatAmount(value, current.currency, locale);
  const facts: [string, string][] = [
    [tIssuances('fields.nominalValue'), money(terms.nominalValue)],
    [tIssuances('fields.targetAmount'), money(terms.targetAmount)],
    [tIssuances('fields.ratePercent'), formatRate(terms.interestRate, locale)],
    [
      tIssuances('fields.distributionFrequency'),
      terms.distributionFrequency ? tIssuances(`frequencies.${terms.distributionFrequency}`) : '—',
    ],
    [
      tIssuances('fields.subscriptionStartDate'),
      formatBusinessDate(terms.subscriptionStartDate, locale),
    ],
    [
      tIssuances('fields.subscriptionEndDate'),
      formatBusinessDate(terms.subscriptionEndDate, locale),
    ],
    [tIssuances('fields.maturityDate'), formatBusinessDate(terms.maturityDate, locale)],
    [tIssuances('fields.minSubscriptionAmount'), money(terms.minSubscriptionAmount)],
    [tIssuances('fields.maxAmountPerInvestor'), money(terms.maxAmountPerInvestor)],
  ];

  return (
    <div className="flex flex-col gap-6">
      <Link href="/portal/opportunities" className="text-sm text-primary-text hover:underline">
        ← {t('back')}
      </Link>
      <PageHeader
        title={current.name}
        description={`${current.code}${current.assetCategory ? ` · ${tIssuances(`categories.${current.assetCategory}`)}` : ''}`}
        actions={<StatusBadge domain="issuance" status={current.status} />}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-2 font-heading font-semibold">{t('terms')}</h2>
          <dl className="flex flex-col text-sm">
            {facts.map(([label, value]) => (
              <div
                key={label}
                className="flex justify-between gap-3 border-b border-border py-1 last:border-0"
              >
                <dt className="text-muted">{label}</dt>
                <dd className="text-right tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section className="rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-2 font-heading font-semibold">{t('documents')}</h2>
          <DocumentsTab id={id} />
        </section>
      </div>
      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="mb-3 font-heading text-lg font-semibold">{t('subscribe')}</h2>
        {current.status !== 'SUBSCRIPTION_OPEN' ? (
          <p className="text-sm text-muted">{t('notOpen')}</p>
        ) : canSubscribe ? (
          <SubscribeForm issuance={current} />
        ) : (
          <p className="text-sm text-muted">{t('noRight')}</p>
        )}
      </section>
    </div>
  );
}

/**
 * Subscription form (SPEC §9.1): the draft is created (or updated after a refusal), then submitted.
 * A refused submission leaves the draft as it is: nothing is sent to the issuer.
 */
function SubscribeForm({ issuance }: { issuance: IssuanceView }) {
  const t = useTranslations('subscriptions.form');
  const locale = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [units, setUnits] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [comment, setComment] = useState('');
  const [documentsAccepted, setDocumentsAccepted] = useState(false);
  const [eligibilityDeclared, setEligibilityDeclared] = useState(false);
  const [draft, setDraft] = useState<{ id: string; version: number } | null>(null);
  const save = useIdempotencyKey();
  const send = useIdempotencyKey();
  const amount = subscriptionAmount(units, issuance.terms.nominalValue, issuance.currency);

  /** Creates the draft, or updates it when a previous submission was refused. */
  const saveDraft = async (body: {
    requestedUnits: string;
    requestedAmount: string;
    paymentReference: string | null;
    comment: string | null;
  }) => {
    if (draft) {
      const { data, error } = await api.PATCH('/api/v1/subscriptions/{id}', {
        params: { path: { id: draft.id } },
        headers: { 'If-Match': `"${draft.version}"` },
        body,
      });
      if (error) throw error;
      return data;
    }
    const { data, error } = await api.POST('/api/v1/subscriptions', {
      params: { header: save.header() },
      body: { issuanceId: issuance.id, ...body },
    });
    save.answered();
    if (error) throw error;
    return data;
  };

  const subscribe = useMutation({
    mutationFn: async () => {
      const body = {
        requestedUnits: units.trim(),
        requestedAmount: amount!,
        paymentReference: paymentReference.trim() || null,
        comment: comment.trim() || null,
      };
      const saved = await saveDraft(body);
      setDraft({ id: saved.id, version: saved.version });
      const { data, error } = await api.POST('/api/v1/subscriptions/{id}/submit', {
        params: { path: { id: saved.id }, header: send.header() },
        body: { documentsAccepted, eligibilityDeclared },
      });
      send.answered();
      if (error) throw error;
      return data;
    },
    onSuccess: async (submitted) => {
      await queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
      router.push(`/portal/subscriptions/${submitted.id}`);
    },
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (amount) subscribe.mutate();
  };
  const refused = subscribe.isError && errorCodeOf(subscribe.error) === 'ELIGIBILITY_FAILED';

  return (
    <form className="flex max-w-xl flex-col gap-4" onSubmit={onSubmit} noValidate>
      <FormField
        label={t('units')}
        hint={t('unitsHint', {
          nominal: formatAmount(issuance.terms.nominalValue, issuance.currency, locale),
          minimum: formatAmount(issuance.terms.minSubscriptionAmount, issuance.currency, locale),
        })}
        error={units.trim() && !amount ? t('unitsInvalid') : undefined}
      >
        <Input
          inputMode="numeric"
          value={units}
          onChange={(event) => setUnits(event.target.value)}
          className="w-48"
        />
      </FormField>
      <p className="text-sm" aria-live="polite">
        <span className="text-muted">{t('amount')}</span>{' '}
        <span className="font-semibold tabular-nums">
          {amount ? formatAmount(amount, issuance.currency, locale) : '—'}
        </span>
      </p>
      <FormField label={t('paymentReference')} hint={t('paymentReferenceHint')}>
        <Input
          value={paymentReference}
          onChange={(event) => setPaymentReference(event.target.value)}
          maxLength={100}
        />
      </FormField>
      <FormField label={t('comment')}>
        <Textarea
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          maxLength={2000}
        />
      </FormField>
      <label className="flex items-start gap-2 text-sm">
        <Checkbox
          checked={documentsAccepted}
          onChange={(event) => setDocumentsAccepted(event.target.checked)}
          className="mt-0.5"
        />
        {t('documentsAccepted')}
      </label>
      <label className="flex items-start gap-2 text-sm">
        <Checkbox
          checked={eligibilityDeclared}
          onChange={(event) => setEligibilityDeclared(event.target.checked)}
          className="mt-0.5"
        />
        {t('eligibilityDeclared')}
      </label>
      {refused ? (
        <div role="alert" className="flex flex-col gap-2 rounded-lg border border-error/40 p-4">
          <p className="font-semibold">{t('refusedTitle')}</p>
          <p className="text-sm text-muted">{t('refusedHelp')}</p>
          <EligibilityResult result="NOT_ELIGIBLE" rules={failedRulesOf(subscribe.error)} />
        </div>
      ) : subscribe.isError ? (
        <ApiError error={subscribe.error} />
      ) : null}
      <div>
        <Button
          type="submit"
          disabled={!amount || !documentsAccepted || !eligibilityDeclared || subscribe.isPending}
        >
          {t('submit')}
        </Button>
      </div>
    </form>
  );
}
