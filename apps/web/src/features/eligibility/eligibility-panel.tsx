'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { EligibilityStatus } from '@veris/shared';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { ApiError } from '@/components/app/api-error';
import { FormField } from '@/components/app/form-field';
import { StatusBadge } from '@/components/app/status-badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api/client';
import { useIdempotencyKey } from '@/lib/api/idempotency';
import type { operations } from '@/lib/api/schema';
import { EligibilityResult } from './eligibility-result';

type RuleSet =
  operations['EligibilityController_preview']['requestBody']['content']['application/json']['ruleSet'];

interface Rights {
  /** eligibility:read — history and simulation. */
  canRead: boolean;
  /** eligibility:decide — Compliance Officer's decision. */
  canDecide: boolean;
}

/** Eligibility of an investor (SPEC §8.3, §8.4): status, decisions and a rules simulator. */
export function EligibilityPanel({
  investorId,
  status,
  rights,
}: {
  investorId: string;
  status: EligibilityStatus;
  rights: Rights;
}) {
  const t = useTranslations('eligibility');
  return (
    <section
      aria-labelledby="eligibility-title"
      className="flex flex-col gap-5 rounded-xl border border-border bg-surface p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="eligibility-title" className="font-heading text-lg font-semibold">
          {t('title')}
        </h2>
        <StatusBadge domain="eligibility" status={status} />
      </div>
      {rights.canDecide ? <DecisionForm investorId={investorId} current={status} /> : null}
      {rights.canRead ? <Simulator investorId={investorId} /> : null}
      {rights.canRead ? <History investorId={investorId} /> : null}
    </section>
  );
}

function DecisionForm({ investorId, current }: { investorId: string; current: EligibilityStatus }) {
  const t = useTranslations('eligibility');
  const tStatus = useTranslations('status.eligibility');
  const queryClient = useQueryClient();
  const idempotency = useIdempotencyKey();
  const choices = (['ELIGIBLE', 'NOT_ELIGIBLE', 'SUSPENDED'] as const).filter(
    (choice) => choice !== current,
  );
  const [status, setStatus] = useState<(typeof choices)[number]>(choices[0]!);
  const [justification, setJustification] = useState('');
  const decide = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST('/api/v1/investors/{id}/eligibility-status', {
        params: { path: { id: investorId }, header: idempotency.header() },
        body: { status, justification: justification.trim() },
      });
      idempotency.answered();
      if (error) throw error;
      return data;
    },
    onSuccess: async (updated) => {
      setJustification('');
      queryClient.setQueryData(['investor', investorId], updated);
      await queryClient.invalidateQueries({ queryKey: ['eligibility', investorId] });
    },
  });
  return (
    <form
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        decide.mutate();
      }}
      className="grid gap-3 md:grid-cols-[1fr_2fr]"
      noValidate
    >
      <h3 className="text-sm font-semibold md:col-span-2">{t('decide.title')}</h3>
      <FormField label={t('decide.status')}>
        <Select
          value={status}
          onChange={(event) => setStatus(event.target.value as (typeof choices)[number])}
        >
          {choices.map((choice) => (
            <option key={choice} value={choice}>
              {tStatus(choice)}
            </option>
          ))}
        </Select>
      </FormField>
      <FormField label={t('decide.justification')}>
        <Textarea
          value={justification}
          onChange={(event) => setJustification(event.target.value)}
          maxLength={4000}
        />
      </FormField>
      <div className="flex flex-col gap-2 md:col-span-2">
        {decide.isError ? <ApiError error={decide.error} /> : null}
        <Button
          type="submit"
          className="self-start"
          disabled={!justification.trim() || decide.isPending}
        >
          {t('decide.submit')}
        </Button>
      </div>
    </form>
  );
}

/** Countries of the reference data, several at once. */
function CountriesField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const locale = useLocale();
  const countries = useQuery({
    queryKey: ['reference', 'countries'],
    queryFn: async () => (await api.GET('/api/v1/reference/countries')).data ?? [],
    staleTime: Infinity,
  });
  const named = (countries.data ?? [])
    .map((country) => ({
      code: country.code,
      name: locale === 'fr-FR' ? country.nameFr : country.nameEn,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));
  return (
    <FormField label={label}>
      <Select
        multiple
        size={6}
        className="h-auto"
        value={value}
        onChange={(event) =>
          onChange([...event.target.selectedOptions].map((option) => option.value))
        }
      >
        {named.map((country) => (
          <option key={country.code} value={country.code}>
            {country.name}
          </option>
        ))}
      </Select>
    </FormField>
  );
}

const DEFAULT_RULES: RuleSet = {
  professionalOnly: true,
  allowedCountries: [],
  excludedCountries: [],
  allowedInvestorTypes: [],
  allowedClassifications: [],
  kycRequired: true,
  kycMinRemainingValidityDays: 0,
  maxInvestors: null,
  rulesVersion: 0,
};

/** Tries the investor against the rules of a future issuance, without recording anything. */
function Simulator({ investorId }: { investorId: string }) {
  const t = useTranslations('eligibility.simulate');
  const [rules, setRules] = useState<RuleSet>(DEFAULT_RULES);
  const [minDays, setMinDays] = useState('0');
  const preview = useMutation({
    mutationFn: async () => {
      const days = Number.parseInt(minDays, 10);
      const { data, error } = await api.POST('/api/v1/eligibility-assessments/preview', {
        body: {
          investorId,
          ruleSet: { ...rules, kycMinRemainingValidityDays: Number.isNaN(days) ? 0 : days },
        },
      });
      if (error) throw error;
      return data;
    },
  });
  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4">
      <div>
        <h3 className="text-sm font-semibold">{t('title')}</h3>
        <p className="text-sm text-muted">{t('help')}</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={rules.professionalOnly}
            onChange={(event) => setRules({ ...rules, professionalOnly: event.target.checked })}
          />
          {t('professionalOnly')}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={rules.kycRequired}
            onChange={(event) => setRules({ ...rules, kycRequired: event.target.checked })}
          />
          {t('kycRequired')}
        </label>
        <FormField label={t('minDays')}>
          <Input
            inputMode="numeric"
            value={minDays}
            onChange={(event) => setMinDays(event.target.value.replace(/\D/g, ''))}
          />
        </FormField>
        <span aria-hidden="true" />
        <CountriesField
          label={t('excludedCountries')}
          value={[...rules.excludedCountries]}
          onChange={(value) => setRules({ ...rules, excludedCountries: value })}
        />
        <CountriesField
          label={t('allowedCountries')}
          value={[...rules.allowedCountries]}
          onChange={(value) => setRules({ ...rules, allowedCountries: value })}
        />
      </div>
      {preview.isError ? <ApiError error={preview.error} /> : null}
      <Button
        variant="secondary"
        className="self-start"
        disabled={preview.isPending}
        onClick={() => preview.mutate()}
      >
        {t('submit')}
      </Button>
      {preview.data ? (
        <EligibilityResult result={preview.data.result} rules={preview.data.rules} />
      ) : null}
    </div>
  );
}

function History({ investorId }: { investorId: string }) {
  const t = useTranslations('eligibility.history');
  const format = useFormatter();
  const [open, setOpen] = useState<string | null>(null);
  const history = useQuery({
    queryKey: ['eligibility', investorId],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/eligibility-assessments', {
        params: { query: { investorId, pageSize: 20 } },
      });
      if (error) throw error;
      return data.data;
    },
  });
  return (
    <div className="flex flex-col gap-2 border-t border-border pt-4">
      <h3 className="text-sm font-semibold">{t('title')}</h3>
      {history.isError ? <ApiError error={history.error} /> : null}
      {history.data?.length === 0 ? <p className="text-sm text-muted">{t('none')}</p> : null}
      <ul className="flex flex-col divide-y divide-border text-sm">
        {(history.data ?? []).map((item) => (
          <li key={item.id} className="flex flex-col gap-2 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                <span className={item.result === 'ELIGIBLE' ? 'text-success' : 'text-error-text'}>
                  {t(`result.${item.result}`)}
                </span>
                <span className="text-muted">
                  {' · '}
                  {t(`context.${item.context}`)} ·{' '}
                  {format.dateTime(new Date(item.assessedAt), {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </span>
              </span>
              <Button
                size="sm"
                variant="ghost"
                aria-expanded={open === item.id}
                onClick={() => setOpen(open === item.id ? null : item.id)}
              >
                {open === item.id ? t('hide') : t('show')}
              </Button>
            </div>
            {item.justification ? (
              <p className="whitespace-pre-wrap text-muted">{item.justification}</p>
            ) : null}
            {open === item.id ? (
              <EligibilityResult result={item.result} rules={item.rules} />
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
