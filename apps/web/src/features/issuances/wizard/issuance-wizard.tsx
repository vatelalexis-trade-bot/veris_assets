'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ISSUANCE_WIZARD_STEPS, type IssuanceWizardStep } from '@veris/shared';
import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ApiError } from '@/components/app/api-error';
import { PageHeader } from '@/components/app/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api/client';
import { cn } from '@/lib/utils';
import type { IssuanceCheck, IssuanceView } from '../types';
import { ReviewStep } from './review-step';
import { DocumentsStep, EligibilityStep, FinancialStep, GeneralStep, ServicingStep } from './steps';
import type { SaveState } from './use-autosave';

export interface StepProps {
  issuance: IssuanceView;
  /** Saves a part of the issuance (with its current version) and keeps the answer. */
  save: Savers;
  /** Consistency failures of SPEC §6.3 for a field (e.g. `terms.targetAmount`). */
  failuresOf: (field: string) => IssuanceCheck[];
  /** Lets the wizard save the step at once before leaving it. */
  registerFlush: (flush: () => Promise<void>) => void;
  onState: (state: SaveState) => void;
}

export interface Savers {
  general: (changes: Record<string, unknown>) => Promise<void>;
  terms: (changes: Record<string, unknown>) => Promise<void>;
  rules: (changes: Record<string, unknown>) => Promise<void>;
}

/** Creation wizard in six steps, saved automatically (SPEC §6.2, P10-1). */
export function IssuanceWizard({ id, canSubmit }: { id: string; canSubmit: boolean }) {
  const t = useTranslations('issuances.wizard');
  const queryClient = useQueryClient();
  const issuance = useQuery({
    queryKey: ['issuance', id],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/issuances/{id}', { params: { path: { id } } });
      if (error) throw error;
      return data;
    },
  });
  const checks = useQuery({
    queryKey: ['issuance', id, 'checks'],
    queryFn: async () => {
      const { data, error } = await api.POST('/api/v1/issuances/{id}/validate', {
        params: { path: { id } },
      });
      if (error) throw error;
      return data;
    },
    enabled: issuance.data?.status === 'DRAFT',
  });
  const [step, setStep] = useState<IssuanceWizardStep | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const flush = useRef<() => Promise<void>>(() => Promise.resolve());
  const registerFlush = useCallback((fn: () => Promise<void>) => {
    flush.current = fn;
  }, []);

  const save = useMemo<Savers>(() => {
    // The latest versions are read at saving time: the answer of a save gives the next version.
    const latest = () => queryClient.getQueryData<IssuanceView>(['issuance', id])!;
    const keep = (updated: IssuanceView) => {
      queryClient.setQueryData(['issuance', id], updated);
      void queryClient.invalidateQueries({ queryKey: ['issuance', id, 'checks'] });
      void queryClient.invalidateQueries({ queryKey: ['issuances'] });
    };
    return {
      general: async (changes) => {
        const { data, error } = await api.PATCH('/api/v1/issuances/{id}', {
          params: { path: { id } },
          headers: { 'If-Match': `"${latest().version}"` },
          body: changes,
        });
        if (error) throw error;
        keep(data);
      },
      terms: async (changes) => {
        const { data, error } = await api.PATCH('/api/v1/issuances/{id}/terms', {
          params: { path: { id } },
          headers: { 'If-Match': `"${latest().terms.version}"` },
          body: changes,
        });
        if (error) throw error;
        keep(data);
      },
      rules: async (changes) => {
        const { data, error } = await api.PATCH('/api/v1/issuances/{id}/eligibility-rules', {
          params: { path: { id } },
          headers: { 'If-Match': `"${latest().eligibilityRules.version}"` },
          body: changes,
        });
        if (error) throw error;
        keep(data);
      },
    };
  }, [queryClient, id]);

  if (issuance.isError) return <ApiError error={issuance.error} />;
  if (!issuance.data) return <Skeleton className="h-60 w-full" />;
  const current = issuance.data;
  if (current.status !== 'DRAFT') {
    return (
      <div className="flex flex-col gap-3">
        <p>{t('notEditable')}</p>
        <Link href={`/issuer/issuances/${id}`} className="text-primary-text hover:underline">
          {t('openIssuance')}
        </Link>
      </div>
    );
  }
  const active = step ?? current.wizardStep;
  const index = ISSUANCE_WIZARD_STEPS.indexOf(active);
  const failuresOf = (field: string) =>
    (checks.data?.failures ?? []).filter((failure) => failure.field === field);
  const goTo = async (next: IssuanceWizardStep) => {
    await flush.current();
    setStep(next);
    if (next !== current.wizardStep)
      await save.general({ wizardStep: next }).catch(() => undefined);
  };
  const props: StepProps = {
    issuance: current,
    save,
    failuresOf,
    registerFlush,
    onState: setSaveState,
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={current.name}
        description={t('description', { code: current.code })}
        actions={
          <p role="status" aria-live="polite" className="text-sm text-muted">
            {saveState === 'saving'
              ? t('saving')
              : saveState === 'saved'
                ? t('saved')
                : saveState === 'error'
                  ? t('saveFailed')
                  : ''}
          </p>
        }
      />
      <nav aria-label={t('steps')}>
        <ol className="flex flex-wrap gap-2">
          {ISSUANCE_WIZARD_STEPS.map((value, position) => (
            <li key={value}>
              <button
                type="button"
                onClick={() => void goTo(value)}
                aria-current={value === active ? 'step' : undefined}
                className={cn(
                  'flex items-center gap-2 rounded-full border px-3 py-1 text-sm',
                  value === active
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border text-muted hover:text-foreground',
                )}
              >
                {position < index ? (
                  <Check aria-hidden="true" className="size-4" />
                ) : (
                  <span aria-hidden="true">{position + 1}</span>
                )}
                {t(`stepNames.${value}`)}
              </button>
            </li>
          ))}
        </ol>
      </nav>
      <div className="rounded-xl border border-border bg-surface p-5">
        {active === 'GENERAL' ? <GeneralStep key="general" {...props} /> : null}
        {active === 'FINANCIAL' ? <FinancialStep key="financial" {...props} /> : null}
        {active === 'ELIGIBILITY' ? <EligibilityStep key="eligibility" {...props} /> : null}
        {active === 'SERVICING' ? <ServicingStep key="servicing" {...props} /> : null}
        {active === 'DOCUMENTS' ? <DocumentsStep key="documents" {...props} /> : null}
        {active === 'REVIEW' ? (
          <ReviewStep
            key="review"
            {...props}
            checks={checks.data}
            canSubmit={canSubmit}
            onEdit={(value) => void goTo(value)}
          />
        ) : null}
      </div>
      <div className="flex justify-between gap-2">
        <Button
          variant="secondary"
          disabled={index === 0}
          onClick={() => void goTo(ISSUANCE_WIZARD_STEPS[index - 1]!)}
        >
          {t('previous')}
        </Button>
        {index < ISSUANCE_WIZARD_STEPS.length - 1 ? (
          <Button onClick={() => void goTo(ISSUANCE_WIZARD_STEPS[index + 1]!)}>{t('next')}</Button>
        ) : null}
      </div>
    </div>
  );
}
