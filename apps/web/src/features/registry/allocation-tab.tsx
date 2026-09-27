'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { parseDecimal } from '@veris/shared';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { Dialog } from 'radix-ui';
import { useState } from 'react';
import { ApiError } from '@/components/app/api-error';
import { ConfirmDialog } from '@/components/app/confirm-dialog';
import { FormField } from '@/components/app/form-field';
import { StatusBadge } from '@/components/app/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { formatAmount } from '@/features/issuances/format';
import type { IssuanceView } from '@/features/issuances/types';
import { api } from '@/lib/api/client';
import { useIdempotencyKey } from '@/lib/api/idempotency';
import type { AllocationRoundView } from './types';

export interface AllocationRights {
  canPrepare: boolean;
  canValidate: boolean;
}

const WHOLE_UNITS = /^\d{1,16}$/;

/**
 * Manual allocation of an issuance (SPEC §10.1, §9.4): the round in progress or validated, and the
 * rejected ones. Prepared by the issuer, validated by another Issuer Administrator (four eyes).
 */
export function AllocationTab({
  issuance,
  rights,
  currentUserId,
}: {
  issuance: IssuanceView;
  rights: AllocationRights;
  currentUserId: string;
}) {
  const t = useTranslations('allocation');
  const format = useFormatter();
  const queryClient = useQueryClient();
  const idempotency = useIdempotencyKey();
  const rounds = useQuery({
    queryKey: ['allocation-rounds', issuance.id],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/issuances/{id}/allocation-rounds', {
        params: { path: { id: issuance.id } },
      });
      if (error) throw error;
      return data;
    },
  });
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['allocation-rounds', issuance.id] });
    await queryClient.invalidateQueries({ queryKey: ['issuance', issuance.id] });
    await queryClient.invalidateQueries({ queryKey: ['positions', issuance.id] });
    await queryClient.invalidateQueries({ queryKey: ['ledger', issuance.id] });
  };
  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST('/api/v1/issuances/{id}/allocation-rounds', {
        params: { path: { id: issuance.id }, header: idempotency.header() },
      });
      idempotency.answered();
      if (error) throw error;
      return data;
    },
    onSuccess: refresh,
  });

  if (rounds.isError) return <ApiError error={rounds.error} />;
  const all = rounds.data ?? [];
  const current = all.find((round) => round.status !== 'REJECTED');
  const rejected = all.filter((round) => round.status === 'REJECTED');

  return (
    <div className="flex flex-col gap-6">
      {current ? (
        <RoundPanel
          key={`${current.id}-${current.version}`}
          round={current}
          rights={rights}
          currentUserId={currentUserId}
          onChanged={refresh}
        />
      ) : issuance.status === 'SUBSCRIPTION_CLOSED' ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-muted">{t('none')}</p>
          {rights.canPrepare ? (
            <Button onClick={() => create.mutate()} disabled={create.isPending}>
              {t('prepare')}
            </Button>
          ) : null}
          {create.isError ? <ApiError error={create.error} /> : null}
        </div>
      ) : (
        <p className="text-sm text-muted">{t('notClosed')}</p>
      )}
      {rejected.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h3 className="font-heading font-semibold">{t('previousRounds')}</h3>
          <ul className="flex flex-col gap-2 text-sm">
            {rejected.map((round) => (
              <li key={round.id} className="rounded-lg border border-border p-3">
                <p>
                  <StatusBadge domain="allocationRound" status={round.status} />{' '}
                  {format.dateTime(new Date(round.createdAt), { dateStyle: 'medium' })} ·{' '}
                  {t('allocatedTotal', { units: round.totals.allocatedUnits })}
                </p>
                {round.rejectionComment ? (
                  <p className="mt-1 whitespace-pre-wrap text-muted">{round.rejectionComment}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function RoundPanel({
  round,
  rights,
  currentUserId,
  onChanged,
}: {
  round: AllocationRoundView;
  rights: AllocationRights;
  currentUserId: string;
  onChanged: () => Promise<void>;
}) {
  const t = useTranslations('allocation');
  const tErrors = useTranslations('errors');
  const locale = useLocale();
  const format = useFormatter();
  const { issuance } = round;
  const editable = round.status === 'DRAFT' && rights.canPrepare;
  const [units, setUnits] = useState<Record<string, string>>(() =>
    Object.fromEntries(round.lines.map((line) => [line.subscriptionId, line.allocatedUnits])),
  );
  const [justification, setJustification] = useState(round.minimumWaiverJustification ?? '');
  const proposeKey = useIdempotencyKey();
  const validateKey = useIdempotencyKey();

  const valid = Object.values(units).every((value) => WHOLE_UNITS.test(value));
  const dirty =
    round.lines.some((line) => units[line.subscriptionId] !== line.allocatedUnits) ||
    justification.trim() !== (round.minimumWaiverJustification ?? '');
  const total = valid
    ? Object.values(units)
        .reduce((sum, value) => sum.plus(parseDecimal(value)), parseDecimal('0'))
        .toString()
    : null;
  const amountOf = (value: string) =>
    WHOLE_UNITS.test(value)
      ? parseDecimal(value).times(parseDecimal(issuance.nominalValue)).toString()
      : null;
  const totalAmount = total ? amountOf(total) : null;
  const belowMinimum =
    totalAmount !== null &&
    issuance.minimumAmount !== null &&
    parseDecimal(totalAmount).lt(parseDecimal(issuance.minimumAmount));
  const aboveSupply = total !== null && parseDecimal(total).gt(parseDecimal(issuance.totalUnits));

  const save = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.PATCH('/api/v1/allocations/{id}', {
        params: { path: { id: round.id } },
        headers: { 'If-Match': `"${round.version}"` },
        body: {
          lines: round.lines.map((line) => ({
            subscriptionId: line.subscriptionId,
            allocatedUnits: units[line.subscriptionId]!,
          })),
          minimumWaiverJustification: justification.trim() || null,
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: onChanged,
  });
  const propose = useMutation({
    mutationFn: async () => {
      const { error } = await api.POST('/api/v1/allocations/{id}/propose', {
        params: { path: { id: round.id }, header: proposeKey.header() },
      });
      proposeKey.answered();
      if (error) throw error;
    },
    onSuccess: onChanged,
  });
  const validate = useMutation({
    mutationFn: async () => {
      const { error } = await api.POST('/api/v1/allocations/{id}/validate', {
        params: { path: { id: round.id }, header: validateKey.header() },
      });
      validateKey.answered();
      if (error) throw error;
    },
    onSuccess: onChanged,
  });
  const money = (value: string | null) => formatAmount(value, issuance.currency, locale);
  const proposedByMe = round.proposedBy === currentUserId;

  return (
    <section className="flex flex-col gap-4" aria-labelledby="allocation-round-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="allocation-round-title" className="font-heading text-lg font-semibold">
          {t('roundTitle')}
        </h3>
        <StatusBadge domain="allocationRound" status={round.status} />
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-3">
        <div className="rounded-lg border border-border p-3">
          <dt className="text-muted">{t('allocatedUnits')}</dt>
          <dd
            className={aboveSupply ? 'font-semibold text-error-text' : 'font-semibold'}
            role="status"
          >
            {t('unitsOf', { units: total ?? '—', total: issuance.totalUnits })}
          </dd>
        </div>
        <div className="rounded-lg border border-border p-3">
          <dt className="text-muted">{t('allocatedAmount')}</dt>
          <dd className={belowMinimum ? 'font-semibold text-warning' : 'font-semibold'}>
            {money(totalAmount)}
          </dd>
        </div>
        <div className="rounded-lg border border-border p-3">
          <dt className="text-muted">{t('requestedUnits')}</dt>
          <dd className="font-semibold">{round.totals.requestedUnits}</dd>
        </div>
      </dl>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <caption className="sr-only">{t('linesCaption')}</caption>
          <thead className="bg-surface text-left text-muted">
            <tr>
              <th scope="col" className="px-3 py-2">
                {t('columns.investor')}
              </th>
              <th scope="col" className="px-3 py-2 text-right">
                {t('columns.requested')}
              </th>
              <th scope="col" className="px-3 py-2 text-right">
                {t('columns.allocated')}
              </th>
              <th scope="col" className="px-3 py-2 text-right">
                {t('columns.amount')}
              </th>
            </tr>
          </thead>
          <tbody>
            {round.lines.map((line) => {
              const value = units[line.subscriptionId] ?? '';
              const overRequest =
                WHOLE_UNITS.test(value) &&
                parseDecimal(value).gt(parseDecimal(line.requestedUnits));
              return (
                <tr key={line.subscriptionId} className="border-t border-border">
                  <th scope="row" className="px-3 py-2 text-left font-normal">
                    {line.investorName}
                  </th>
                  <td className="px-3 py-2 text-right tabular-nums">{line.requestedUnits}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {editable ? (
                      <Input
                        aria-label={t('unitsFor', { investor: line.investorName })}
                        inputMode="numeric"
                        value={value}
                        aria-invalid={!WHOLE_UNITS.test(value) || overRequest ? true : undefined}
                        onChange={(event) =>
                          setUnits((previous) => ({
                            ...previous,
                            [line.subscriptionId]: event.target.value.trim(),
                          }))
                        }
                        className="ml-auto w-28 text-right"
                      />
                    ) : (
                      line.allocatedUnits
                    )}
                    {overRequest ? (
                      <span className="block text-xs text-error-text">{t('overRequest')}</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(amountOf(value))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {round.status === 'DRAFT' && round.failures.length > 0 && !dirty ? (
        <ul
          className="flex flex-col gap-1 rounded-lg border border-warning/40 p-3 text-sm"
          role="alert"
        >
          {round.failures.map((failure, index) => (
            <li key={`${failure.code}-${index}`}>
              {tErrors(failure.code)}
              {failure.meta?.allocatedUnits
                ? ` ${t('supplyDetail', { units: failure.meta.allocatedUnits, total: failure.meta.totalUnits ?? '' })}`
                : ''}
            </li>
          ))}
        </ul>
      ) : null}

      {editable && (belowMinimum || round.minimumWaiverJustification) ? (
        <FormField
          label={t('justification')}
          hint={t('justificationHint', { minimum: money(issuance.minimumAmount) })}
        >
          <Textarea
            value={justification}
            onChange={(event) => setJustification(event.target.value)}
            maxLength={2000}
          />
        </FormField>
      ) : round.minimumWaiverJustification ? (
        <p className="text-sm">
          <span className="text-muted">{t('justification')} :</span>{' '}
          {round.minimumWaiverJustification}
        </p>
      ) : null}

      {round.proposedByName ? (
        <p className="text-sm text-muted">
          {t('proposedBy', {
            name: round.proposedByName,
            date: format.dateTime(new Date(round.proposedAt!), {
              dateStyle: 'medium',
              timeStyle: 'short',
            }),
          })}
        </p>
      ) : null}
      {round.validatedByName ? (
        <p className="text-sm text-muted">
          {t('validatedBy', {
            name: round.validatedByName,
            date: format.dateTime(new Date(round.validatedAt!), {
              dateStyle: 'medium',
              timeStyle: 'short',
            }),
          })}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {editable ? (
          <>
            <Button
              variant="secondary"
              disabled={!dirty || !valid || save.isPending}
              onClick={() => save.mutate()}
            >
              {t('save')}
            </Button>
            <ConfirmDialog
              trigger={<Button disabled={dirty}>{t('propose')}</Button>}
              title={t('proposeTitle')}
              description={t('proposeDescription')}
              confirmLabel={t('propose')}
              onConfirm={() => propose.mutateAsync()}
            />
            <CommentButton round={round} action="abandon" onDone={onChanged} />
          </>
        ) : null}
        {round.status === 'PROPOSED' && rights.canValidate && !proposedByMe ? (
          <>
            <ConfirmDialog
              trigger={<Button>{t('validate')}</Button>}
              title={t('validateTitle')}
              description={t('validateDescription', { units: round.totals.allocatedUnits })}
              confirmLabel={t('validate')}
              onConfirm={() => validate.mutateAsync()}
            />
            <CommentButton round={round} action="reject" onDone={onChanged} />
          </>
        ) : null}
      </div>
      {editable && dirty ? <p className="text-xs text-muted">{t('saveFirst')}</p> : null}
      {round.status === 'PROPOSED' && rights.canValidate && proposedByMe ? (
        <p className="text-sm text-muted">{t('fourEyes')}</p>
      ) : null}
      {save.isError ? <ApiError error={save.error} /> : null}
      {propose.isError ? <ApiError error={propose.error} /> : null}
      {validate.isError ? <ApiError error={validate.error} /> : null}
    </section>
  );
}

/** Rejection by the validator, or abandon of a draft by the preparer: a comment is required. */
function CommentButton({
  round,
  action,
  onDone,
}: {
  round: AllocationRoundView;
  action: 'reject' | 'abandon';
  onDone: () => Promise<void>;
}) {
  const t = useTranslations('allocation');
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState('');
  const idempotency = useIdempotencyKey();
  const run = useMutation({
    mutationFn: async () => {
      const { error } = await api.POST('/api/v1/allocations/{id}/reject', {
        params: { path: { id: round.id }, header: idempotency.header() },
        body: { comment: comment.trim() },
      });
      idempotency.answered();
      if (error) throw error;
    },
    onSuccess: async () => {
      setOpen(false);
      await onDone();
    },
  });
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        run.reset();
      }}
    >
      <Dialog.Trigger asChild>
        <Button variant={action === 'reject' ? 'destructive' : 'secondary'}>{t(action)}</Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-background/80" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 flex w-[min(92vw,30rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-xl border border-border bg-surface p-6">
          <Dialog.Title className="text-lg font-semibold">{t(`${action}Title`)}</Dialog.Title>
          <Dialog.Description className="text-sm text-muted">
            {t(`${action}Description`)}
          </Dialog.Description>
          <FormField label={t('commentRequired')}>
            <Textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              maxLength={2000}
            />
          </FormField>
          {run.isError ? <ApiError error={run.error} /> : null}
          <div className="flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button variant="secondary">{tCommon('cancel')}</Button>
            </Dialog.Close>
            <Button
              variant={action === 'reject' ? 'destructive' : 'primary'}
              disabled={!comment.trim() || run.isPending}
              onClick={() => run.mutate()}
            >
              {t(action)}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
