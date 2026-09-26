'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { ApiError } from '@/components/app/api-error';
import { ConfirmDialog } from '@/components/app/confirm-dialog';
import { Button } from '@/components/ui/button';
import { formatAmount } from '@/features/issuances/format';
import { api } from '@/lib/api/client';
import { useIdempotencyKey } from '@/lib/api/idempotency';
import type { SubscriptionView } from './types';

export interface PaymentRights {
  canPrepare: boolean;
  canConfirm: boolean;
  currentUserId: string;
}

/**
 * Fictitious payment of an allocated subscription (SPEC §9.2, §4.8, D-009): prepared by the
 * issuer's staff, confirmed by another Issuer Administrator. No real payment is made.
 */
export function PaymentPanel({
  subscription,
  rights,
}: {
  subscription: SubscriptionView;
  rights: PaymentRights | null;
}) {
  const t = useTranslations('subscriptions.payment');
  const locale = useLocale();
  const format = useFormatter();
  const queryClient = useQueryClient();
  const prepareKey = useIdempotencyKey();
  const confirmKey = useIdempotencyKey();
  const id = subscription.id;
  const payment = useQuery({
    queryKey: ['subscription', id, 'payment'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/subscriptions/{id}/payment', {
        params: { path: { id } },
      });
      if (error) throw error;
      return data;
    },
  });
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['subscription', id] });
    await queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
  };
  const prepare = useMutation({
    mutationFn: async () => {
      const { error } = await api.POST('/api/v1/subscriptions/{id}/payment/prepare', {
        params: { path: { id }, header: prepareKey.header() },
      });
      prepareKey.answered();
      if (error) throw error;
    },
    onSuccess: refresh,
  });
  const confirm = useMutation({
    mutationFn: async () => {
      const { error } = await api.POST('/api/v1/subscriptions/{id}/payment/confirm', {
        params: { path: { id }, header: confirmKey.header() },
      });
      confirmKey.answered();
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  const current = payment.data ?? null;
  const pending = subscription.status === 'PAYMENT_PENDING';
  const preparable = pending && (current === null || current.status === 'FAILED');
  const confirmable = pending && current?.status === 'PREPARED';
  const preparedByMe = current?.preparedBy === rights?.currentUserId;
  const amount = formatAmount(subscription.amountDue, subscription.currency, locale);

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
      <h2 className="font-heading font-semibold">{t('title')}</h2>
      <p className="text-sm text-muted">{t('fictitious')}</p>
      {payment.isError ? <ApiError error={payment.error} /> : null}
      <p className="text-sm" role="status">
        {current
          ? t(`status.${current.status}`, { amount })
          : pending
            ? t('awaiting', { amount })
            : t('none')}
      </p>
      {current?.providerReference ? (
        <p className="text-xs text-muted">
          {t('reference')} <span className="font-mono">{current.providerReference}</span>
        </p>
      ) : null}
      {current?.confirmedAt ? (
        <p className="text-xs text-muted">
          {t('confirmedOn', {
            date: format.dateTime(new Date(current.confirmedAt), {
              dateStyle: 'medium',
              timeStyle: 'short',
            }),
          })}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {rights?.canPrepare && preparable ? (
          <ConfirmDialog
            trigger={<Button variant="secondary">{t('prepare')}</Button>}
            title={t('prepareTitle')}
            description={t('prepareDescription', { amount })}
            confirmLabel={t('prepare')}
            onConfirm={() => prepare.mutateAsync()}
          />
        ) : null}
        {rights?.canConfirm && confirmable && !preparedByMe ? (
          <ConfirmDialog
            trigger={<Button>{t('confirm')}</Button>}
            title={t('confirmTitle')}
            description={t('confirmDescription', {
              amount,
              units: subscription.allocatedUnits ?? '0',
            })}
            confirmLabel={t('confirm')}
            onConfirm={() => confirm.mutateAsync()}
          />
        ) : null}
      </div>
      {rights?.canConfirm && confirmable && preparedByMe ? (
        <p className="text-sm text-muted">{t('fourEyes')}</p>
      ) : null}
      {prepare.isError ? <ApiError error={prepare.error} /> : null}
      {confirm.isError ? <ApiError error={confirm.error} /> : null}
    </section>
  );
}
