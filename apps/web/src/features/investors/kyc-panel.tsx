'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { Dialog } from 'radix-ui';
import { useState } from 'react';
import { ApiError } from '@/components/app/api-error';
import { ConfirmDialog } from '@/components/app/confirm-dialog';
import { FormField } from '@/components/app/form-field';
import { StatusBadge } from '@/components/app/status-badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { downloadDocument } from '@/features/documents/api';
import { api } from '@/lib/api/client';
import { useIdempotencyKey } from '@/lib/api/idempotency';
import type { KycCaseDetail } from './types';

const KINDS = [
  'REGISTRATION_EXTRACT',
  'ARTICLES_OF_ASSOCIATION',
  'REPRESENTATIVE_ID',
  'BENEFICIAL_OWNERS_DECLARATION',
  'PROOF_OF_ADDRESS',
  'OTHER',
] as const;
type Kind = (typeof KINDS)[number];

interface Rights {
  /** kyc:prepare — open, document and submit a case. */
  canPrepare: boolean;
  /** kyc:decide — approve, reject or send back (Compliance Officer). */
  canDecide: boolean;
}

/** KYC/KYB case of an investor (SPEC §8.2, §4.8): preparation, then decision by someone else. */
export function KycPanel({ investorId, rights }: { investorId: string; rights: Rights }) {
  const t = useTranslations('kyc');
  const format = useFormatter();
  const queryClient = useQueryClient();
  const cases = useQuery({
    queryKey: ['kyc', investorId],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/kyc-cases', {
        params: { query: { investorId, pageSize: 20 } },
      });
      if (error) throw error;
      return data.data;
    },
  });
  const latest = cases.data?.[0];
  const current = useQuery({
    queryKey: ['kyc', investorId, 'case', latest?.id],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/kyc-cases/{id}', {
        params: { path: { id: latest!.id } },
      });
      if (error) throw error;
      return data;
    },
    enabled: Boolean(latest),
  });
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['kyc', investorId] }),
      queryClient.invalidateQueries({ queryKey: ['investor', investorId] }),
    ]);

  const openKey = useIdempotencyKey();
  const open = useMutation({
    mutationFn: async () => {
      const { error } = await api.POST('/api/v1/kyc-cases', {
        params: { header: openKey.header() },
        body: { investorId },
      });
      openKey.answered();
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  const kycCase = current.data;
  const isOpen = kycCase?.status === 'IN_PROGRESS' || kycCase?.status === 'PENDING_REVIEW';

  return (
    <section
      aria-labelledby="kyc-title"
      className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="kyc-title" className="font-heading text-lg font-semibold">
          {t('title')}
        </h2>
        {rights.canPrepare && !isOpen && !cases.isPending ? (
          <Button onClick={() => open.mutate()} disabled={open.isPending}>
            {kycCase ? t('openNew') : t('open')}
          </Button>
        ) : null}
      </div>
      {cases.isError ? <ApiError error={cases.error} /> : null}
      {open.isError ? <ApiError error={open.error} /> : null}
      {cases.data && cases.data.length === 0 ? (
        <p className="text-sm text-muted">{t('none')}</p>
      ) : null}
      {kycCase ? (
        <div className="flex flex-col gap-3">
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted">{t('status')}</dt>
              <dd>
                <StatusBadge domain="kyc" status={kycCase.status} />
              </dd>
            </div>
            <div>
              <dt className="text-muted">{t('preparedAt')}</dt>
              <dd>{format.dateTime(new Date(kycCase.preparedAt), { dateStyle: 'medium' })}</dd>
            </div>
            {kycCase.providerOutcome ? (
              <div>
                <dt className="text-muted">{t('provider')}</dt>
                <dd>
                  {t(`providerOutcome.${kycCase.providerOutcome}`)}
                  {kycCase.suggestedRiskLevel
                    ? ` · ${t('suggestedRisk', { level: t(`risk.${kycCase.suggestedRiskLevel}`) })}`
                    : ''}
                  <span className="block font-mono text-xs text-muted">
                    {kycCase.providerReference}
                  </span>
                </dd>
              </div>
            ) : null}
            {kycCase.validUntil ? (
              <div>
                <dt className="text-muted">{t('validUntil')}</dt>
                <dd>
                  {format.dateTime(new Date(`${kycCase.validUntil}T00:00:00`), {
                    dateStyle: 'long',
                  })}
                </dd>
              </div>
            ) : null}
            {kycCase.decisionComment ? (
              <div className="sm:col-span-2">
                <dt className="text-muted">{t('decisionComment')}</dt>
                <dd className="whitespace-pre-wrap">{kycCase.decisionComment}</dd>
              </div>
            ) : null}
          </dl>
          <EvidenceList kycCase={kycCase} />
          {kycCase.status === 'IN_PROGRESS' && rights.canPrepare ? (
            <Preparation kycCase={kycCase} investorId={investorId} onChanged={refresh} />
          ) : null}
          {kycCase.status === 'PENDING_REVIEW' && rights.canDecide ? (
            <Decision kycCase={kycCase} onDecided={refresh} />
          ) : null}
          {kycCase.status === 'PENDING_REVIEW' && !rights.canDecide ? (
            <p className="text-sm text-muted">{t('waitingForDecision')}</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function EvidenceList({ kycCase }: { kycCase: KycCaseDetail }) {
  const t = useTranslations('kyc');
  const [error, setError] = useState<unknown>(null);
  if (kycCase.documents.length === 0)
    return <p className="text-sm text-muted">{t('noEvidence')}</p>;
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">{t('evidence')}</h3>
      {error ? <ApiError error={error} /> : null}
      <ul className="flex flex-col divide-y divide-border text-sm">
        {kycCase.documents.map((item) => (
          <li
            key={item.documentId}
            className="flex flex-wrap items-center justify-between gap-2 py-2"
          >
            <span>
              {item.name} · <span className="text-muted">{t(`kinds.${item.kind}`)}</span>
            </span>
            <Button
              size="sm"
              variant="secondary"
              onClick={async () => setError(await downloadDocument(item.documentId))}
            >
              {t('download')}
              <span className="sr-only"> {item.name}</span>
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Attach the investor's KYC evidence to the case, then submit it for review. */
function Preparation({
  kycCase,
  investorId,
  onChanged,
}: {
  kycCase: KycCaseDetail;
  investorId: string;
  onChanged: () => Promise<unknown>;
}) {
  const t = useTranslations('kyc');
  const evidence = useQuery({
    queryKey: ['documents', investorId, 'KYC_EVIDENCE'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/documents', {
        params: { query: { investorId, type: 'KYC_EVIDENCE', pageSize: 100 } },
      });
      if (error) throw error;
      return data.data;
    },
  });
  const attached = new Set(kycCase.documents.map((item) => item.documentId));
  const available = (evidence.data ?? []).filter((item) => !attached.has(item.id));
  const [documentId, setDocumentId] = useState('');
  const [kind, setKind] = useState<Kind>('REGISTRATION_EXTRACT');
  const attach = useMutation({
    mutationFn: async () => {
      const { error } = await api.POST('/api/v1/kyc-cases/{id}/documents', {
        params: { path: { id: kycCase.id } },
        body: { documentId, kind },
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      setDocumentId('');
      await onChanged();
    },
  });
  const submitKey = useIdempotencyKey();
  const submit = useMutation({
    mutationFn: async () => {
      const { error } = await api.POST('/api/v1/kyc-cases/{id}/submit-for-review', {
        params: { path: { id: kycCase.id }, header: submitKey.header() },
      });
      submitKey.answered();
      if (error) throw error;
    },
    onSuccess: onChanged,
  });
  return (
    <div className="flex flex-col gap-3 border-t border-border pt-3">
      <h3 className="text-sm font-semibold">{t('attach.title')}</h3>
      {evidence.data && available.length === 0 ? (
        <p className="text-sm text-muted">{t('attach.noneAvailable')}</p>
      ) : null}
      {available.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
          <FormField label={t('attach.document')}>
            <Select value={documentId} onChange={(event) => setDocumentId(event.target.value)}>
              <option value="" disabled />
              {available.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label={t('attach.kind')}>
            <Select value={kind} onChange={(event) => setKind(event.target.value as Kind)}>
              {KINDS.map((value) => (
                <option key={value} value={value}>
                  {t(`kinds.${value}`)}
                </option>
              ))}
            </Select>
          </FormField>
          <Button
            variant="secondary"
            disabled={!documentId || attach.isPending}
            onClick={() => attach.mutate()}
          >
            {t('attach.submit')}
          </Button>
        </div>
      ) : null}
      {attach.isError ? <ApiError error={attach.error} /> : null}
      {submit.isError ? <ApiError error={submit.error} /> : null}
      <ConfirmDialog
        trigger={
          <Button className="self-start" disabled={kycCase.documents.length === 0}>
            {t('submit.action')}
          </Button>
        }
        title={t('submit.title')}
        description={t('submit.description')}
        confirmLabel={t('submit.action')}
        onConfirm={() => submit.mutateAsync()}
      />
    </div>
  );
}

type Outcome = 'approve' | 'reject' | 'send-back';

/** Decision of a Compliance Officer who did not prepare the case (four eyes). */
function Decision({
  kycCase,
  onDecided,
}: {
  kycCase: KycCaseDetail;
  onDecided: () => Promise<unknown>;
}) {
  const t = useTranslations('kyc');
  return (
    <div className="flex flex-wrap gap-2 border-t border-border pt-3">
      {(['approve', 'reject', 'send-back'] as const).map((outcome) => (
        <DecisionDialog
          key={outcome}
          outcome={outcome}
          caseId={kycCase.id}
          onDecided={onDecided}
          label={t(`decide.${outcome}`)}
        />
      ))}
    </div>
  );
}

function DecisionDialog({
  outcome,
  caseId,
  label,
  onDecided,
}: {
  outcome: Outcome;
  caseId: string;
  label: string;
  onDecided: () => Promise<unknown>;
}) {
  const t = useTranslations('kyc');
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState('');
  const idempotency = useIdempotencyKey();
  const commentRequired = outcome !== 'approve';
  const decide = useMutation({
    mutationFn: async () => {
      const params = { path: { id: caseId }, header: idempotency.header() };
      const text = comment.trim();
      const { error } =
        outcome === 'approve'
          ? await api.POST('/api/v1/kyc-cases/{id}/approve', {
              params,
              body: { comment: text || null },
            })
          : outcome === 'reject'
            ? await api.POST('/api/v1/kyc-cases/{id}/reject', { params, body: { comment: text } })
            : await api.POST('/api/v1/kyc-cases/{id}/send-back', {
                params,
                body: { comment: text },
              });
      idempotency.answered();
      if (error) throw error;
    },
    onSuccess: async () => {
      setOpen(false);
      setComment('');
      await onDecided();
    },
  });
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        decide.reset();
      }}
    >
      <Dialog.Trigger asChild>
        <Button
          variant={
            outcome === 'reject' ? 'destructive' : outcome === 'approve' ? 'primary' : 'secondary'
          }
        >
          {label}
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-background/80" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 flex w-[min(92vw,30rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-xl border border-border bg-surface p-6">
          <Dialog.Title className="text-lg font-semibold">
            {t(`decide.${outcome}Title`)}
          </Dialog.Title>
          <Dialog.Description className="text-sm text-muted">
            {t(`decide.${outcome}Description`)}
          </Dialog.Description>
          <FormField label={commentRequired ? t('decide.commentRequired') : t('decide.comment')}>
            <Textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              maxLength={4000}
            />
          </FormField>
          {decide.isError ? <ApiError error={decide.error} /> : null}
          <div className="flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button variant="secondary">{tCommon('cancel')}</Button>
            </Dialog.Close>
            <Button
              variant={outcome === 'reject' ? 'destructive' : 'primary'}
              disabled={decide.isPending || (commentRequired && !comment.trim())}
              onClick={() => decide.mutate()}
            >
              {label}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
