'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleAlert, CircleCheck } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { Dialog } from 'radix-ui';
import { useState } from 'react';
import { ApiError } from '@/components/app/api-error';
import { ConfirmDialog } from '@/components/app/confirm-dialog';
import { FormField } from '@/components/app/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api/client';
import { useIdempotencyKey } from '@/lib/api/idempotency';
import type { LedgerEntryView, PositionView } from './types';

export interface CorrectionRights {
  canRequest: boolean;
  canApprove: boolean;
  currentUserId: string;
}

/** Live check of the registry invariants of SPEC §10.4 (the daily job runs the same one). */
export function ReconciliationStatus({ issuanceId }: { issuanceId: string }) {
  const t = useTranslations('registry.reconciliation');
  const format = useFormatter();
  const check = useQuery({
    queryKey: ['reconciliation', issuanceId],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/ledger/reconciliation', {
        params: { query: { issuanceId } },
      });
      if (error) throw error;
      return data;
    },
  });
  if (check.isError) return <ApiError error={check.error} />;
  if (!check.data) return null;
  const result = check.data;
  return (
    <div
      role="status"
      className={
        result.consistent
          ? 'flex flex-wrap items-center gap-3 rounded-lg border border-success/40 p-3 text-sm'
          : 'flex flex-col gap-2 rounded-lg border border-error/40 p-3 text-sm'
      }
    >
      {result.consistent ? (
        <>
          <CircleCheck aria-hidden="true" className="size-4 text-success" />
          <span>
            {t('consistent', {
              entries: result.entries,
              date: format.dateTime(new Date(result.checkedAt), { timeStyle: 'short' }),
            })}
          </span>
        </>
      ) : (
        <>
          <p className="flex items-center gap-2 font-semibold text-error-text">
            <CircleAlert aria-hidden="true" className="size-4" />
            {t('inconsistent')}
          </p>
          <ul className="list-inside list-disc">
            {result.breaches.map((breach, index) => (
              <li key={index}>
                {t(`details.${breach.detail}`, {
                  invariant: breach.invariant,
                  sequence: breach.sequenceNo ?? '',
                })}
              </li>
            ))}
          </ul>
        </>
      )}
      <Button size="sm" variant="secondary" onClick={() => void check.refetch()}>
        {t('checkAgain')}
      </Button>
    </div>
  );
}

/** Corrections by counter-entry of an issuance's ledger (SPEC §10.3), decided with four eyes. */
export function CorrectionsList({
  issuanceId,
  rights,
}: {
  issuanceId: string;
  rights: CorrectionRights;
}) {
  const t = useTranslations('registry.corrections');
  const format = useFormatter();
  const corrections = useQuery({
    queryKey: ['corrections', issuanceId],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/ledger/corrections', {
        params: { query: { issuanceId } },
      });
      if (error) throw error;
      return data;
    },
  });
  if (corrections.isError) return <ApiError error={corrections.error} />;
  const rows = corrections.data ?? [];
  if (rows.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-heading text-lg font-semibold">{t('title')}</h2>
      <ul className="flex flex-col gap-2 text-sm">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-col gap-1 rounded-lg border border-border p-3">
            <p>
              <span className="font-medium">{t(`status.${row.status}`)}</span> ·{' '}
              {t('requestedBy', {
                name: row.requestedByName ?? '—',
                date: format.dateTime(new Date(row.createdAt), { dateStyle: 'medium' }),
              })}
            </p>
            <p className="whitespace-pre-wrap">{row.reason}</p>
            {row.replacements.length > 0 ? (
              <p className="text-muted">{t('replacements', { count: row.replacements.length })}</p>
            ) : null}
            {row.decidedByName ? (
              <p className="text-muted">
                {t('decidedBy', { name: row.decidedByName })}
                {row.decisionComment ? ` — ${row.decisionComment}` : ''}
              </p>
            ) : null}
            {row.status === 'PROPOSED' && rights.canApprove ? (
              row.requestedBy === rights.currentUserId ? (
                <p className="text-muted">{t('fourEyes')}</p>
              ) : (
                <Decision correctionId={row.id} issuanceId={issuanceId} />
              )
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Decision({ correctionId, issuanceId }: { correctionId: string; issuanceId: string }) {
  const t = useTranslations('registry.corrections');
  const tCommon = useTranslations('common');
  const queryClient = useQueryClient();
  const approveKey = useIdempotencyKey();
  const rejectKey = useIdempotencyKey();
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState('');
  const refresh = async () => {
    for (const key of ['corrections', 'positions', 'ledger', 'reconciliation'])
      await queryClient.invalidateQueries({ queryKey: [key, issuanceId] });
  };
  const approve = useMutation({
    mutationFn: async () => {
      const { error } = await api.POST('/api/v1/ledger/corrections/{id}/approve', {
        params: { path: { id: correctionId }, header: approveKey.header() },
        body: {},
      });
      approveKey.answered();
      if (error) throw error;
    },
    onSuccess: refresh,
  });
  const reject = useMutation({
    mutationFn: async () => {
      const { error } = await api.POST('/api/v1/ledger/corrections/{id}/reject', {
        params: { path: { id: correctionId }, header: rejectKey.header() },
        body: { comment: comment.trim() },
      });
      rejectKey.answered();
      if (error) throw error;
    },
    onSuccess: async () => {
      setOpen(false);
      await refresh();
    },
  });
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <ConfirmDialog
          trigger={<Button size="sm">{t('approve')}</Button>}
          title={t('approveTitle')}
          description={t('approveDescription')}
          confirmLabel={t('approve')}
          onConfirm={() => approve.mutateAsync()}
        />
        <Dialog.Root open={open} onOpenChange={setOpen}>
          <Dialog.Trigger asChild>
            <Button size="sm" variant="destructive">
              {t('reject')}
            </Button>
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-40 bg-background/80" />
            <Dialog.Content className="fixed top-1/2 left-1/2 z-50 flex w-[min(92vw,30rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-xl border border-border bg-surface p-6">
              <Dialog.Title className="text-lg font-semibold">{t('rejectTitle')}</Dialog.Title>
              <Dialog.Description className="text-sm text-muted">
                {t('rejectDescription')}
              </Dialog.Description>
              <FormField label={t('commentRequired')}>
                <Textarea
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  maxLength={2000}
                />
              </FormField>
              {reject.isError ? <ApiError error={reject.error} /> : null}
              <div className="flex justify-end gap-2">
                <Dialog.Close asChild>
                  <Button variant="secondary">{tCommon('cancel')}</Button>
                </Dialog.Close>
                <Button
                  variant="destructive"
                  disabled={!comment.trim() || reject.isPending}
                  onClick={() => reject.mutate()}
                >
                  {t('reject')}
                </Button>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>
      {approve.isError ? <ApiError error={approve.error} /> : null}
    </div>
  );
}

const WHOLE_UNITS = /^\d{1,16}$/;

/** Proposal of a correction of one movement: its counter-entry, and optionally a replacement. */
export function CorrectEntryButton({
  entry,
  accounts,
  accountLabel,
}: {
  entry: LedgerEntryView;
  accounts: readonly PositionView[];
  accountLabel: (position: PositionView) => string;
}) {
  const t = useTranslations('registry.corrections');
  const tCommon = useTranslations('common');
  const queryClient = useQueryClient();
  const idempotency = useIdempotencyKey();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [quantity, setQuantity] = useState('');
  const withReplacement = from !== '' || to !== '' || quantity !== '';
  const replacementValid = !withReplacement || ((from || to) && WHOLE_UNITS.test(quantity));
  const propose = useMutation({
    mutationFn: async () => {
      const { error } = await api.POST('/api/v1/ledger/corrections', {
        params: { header: idempotency.header() },
        body: {
          targetEntryId: entry.id,
          reason: reason.trim(),
          replacements: withReplacement
            ? [{ sourceAccountId: from || null, destinationAccountId: to || null, quantity }]
            : [],
        },
      });
      idempotency.answered();
      if (error) throw error;
    },
    onSuccess: async () => {
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['corrections', entry.issuanceId] });
    },
  });
  const options = (
    <>
      <option value="">{t('noAccount')}</option>
      {accounts.map((position) => (
        <option key={position.accountId} value={position.accountId}>
          {accountLabel(position)}
        </option>
      ))}
    </>
  );
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        propose.reset();
      }}
    >
      <Dialog.Trigger asChild>
        <Button size="sm" variant="ghost">
          {t('correct')}
          <span className="sr-only"> #{entry.sequenceNo}</span>
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-background/80" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 flex w-[min(92vw,32rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-xl border border-border bg-surface p-6">
          <Dialog.Title className="text-lg font-semibold">
            {t('proposeTitle', { sequence: entry.sequenceNo })}
          </Dialog.Title>
          <Dialog.Description className="text-sm text-muted">
            {t('proposeDescription', { quantity: entry.quantity })}
          </Dialog.Description>
          <FormField label={t('reason')}>
            <Textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={2000}
            />
          </FormField>
          <fieldset className="flex flex-col gap-3 rounded-lg border border-border p-3">
            <legend className="px-1 text-sm">{t('replacement')}</legend>
            <FormField label={t('from')}>
              <Select value={from} onChange={(event) => setFrom(event.target.value)}>
                {options}
              </Select>
            </FormField>
            <FormField label={t('to')}>
              <Select value={to} onChange={(event) => setTo(event.target.value)}>
                {options}
              </Select>
            </FormField>
            <FormField label={t('quantity')}>
              <Input
                inputMode="numeric"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value.trim())}
                className="w-40"
              />
            </FormField>
          </fieldset>
          {propose.isError ? <ApiError error={propose.error} /> : null}
          <div className="flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button variant="secondary">{tCommon('cancel')}</Button>
            </Dialog.Close>
            <Button
              disabled={!reason.trim() || !replacementValid || propose.isPending}
              onClick={() => propose.mutate()}
            >
              {t('propose')}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
