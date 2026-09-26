'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { Dialog, Tabs } from 'radix-ui';
import { useState } from 'react';
import { ApiError } from '@/components/app/api-error';
import { ConfirmDialog } from '@/components/app/confirm-dialog';
import { FormField } from '@/components/app/form-field';
import { PageHeader } from '@/components/app/page-header';
import { StatusBadge } from '@/components/app/status-badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { downloadDocument } from '@/features/documents/api';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api/client';
import { useIdempotencyKey } from '@/lib/api/idempotency';
import { formatAmount, formatBusinessDate, formatRate } from './format';
import { AllocationTab } from '@/features/registry/allocation-tab';
import { RegistryView } from '@/features/registry/registry-view';
import { InvitationsTab } from './invitations-tab';
import type { IssuanceView } from './types';

export interface IssuanceRights {
  canEdit: boolean;
  canApprove: boolean;
  canOperate: boolean;
  canCancel: boolean;
  canInvite: boolean;
  canSeeSubscriptions: boolean;
  canReadRegistry: boolean;
  canPrepareAllocation: boolean;
  canValidateAllocation: boolean;
}

/** Statuses from which the allocation, then the registry, have something to show. */
const ALLOCATION_STATUSES = ['SUBSCRIPTION_CLOSED', 'ALLOCATED', 'ACTIVE', 'MATURED'];
const REGISTRY_STATUSES = ['ALLOCATED', 'ACTIVE', 'MATURED'];

type Action = 'approve' | 'open-subscription' | 'close-subscription';
type CommentedAction = 'return-to-draft' | 'cancel';

/** One issuance: summary, explicit actions of its life cycle, invitations, documents, history. */
export function IssuanceDetail({
  id,
  rights,
  currentUserId,
}: {
  id: string;
  rights: IssuanceRights;
  currentUserId: string;
}) {
  const t = useTranslations('issuances');
  const queryClient = useQueryClient();
  const issuance = useQuery({
    queryKey: ['issuance', id],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/issuances/{id}', { params: { path: { id } } });
      if (error) throw error;
      return data;
    },
  });
  const refresh = async (updated: IssuanceView) => {
    queryClient.setQueryData(['issuance', id], updated);
    await queryClient.invalidateQueries({ queryKey: ['issuance', id, 'transitions'] });
    await queryClient.invalidateQueries({ queryKey: ['issuances'] });
  };

  if (issuance.isError) return <ApiError error={issuance.error} />;
  if (!issuance.data) return <Skeleton className="h-60 w-full" />;
  const current = issuance.data;
  const status = current.status;
  const cancellable = [
    'DRAFT',
    'UNDER_REVIEW',
    'APPROVED',
    'SUBSCRIPTION_OPEN',
    'SUBSCRIPTION_CLOSED',
  ].includes(status);
  const submittedByMe = current.submittedBy === currentUserId;

  return (
    <div className="flex flex-col gap-6">
      <Link href="/issuer/issuances" className="text-sm text-primary-text hover:underline">
        ← {t('back')}
      </Link>
      <PageHeader
        title={current.name}
        description={`${current.code}${current.assetCategory ? ` · ${t(`categories.${current.assetCategory}`)}` : ''}`}
        actions={<StatusBadge domain="issuance" status={status} />}
      />
      {current.statusComment ? (
        <p className="rounded-lg border border-warning/40 p-3 text-sm">
          <span className="font-medium">{t('statusComment')}</span> {current.statusComment}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {status === 'DRAFT' && rights.canEdit ? (
          <Button asChild>
            <Link href={`/issuer/issuances/${id}/edit`}>{t('actions.edit')}</Link>
          </Button>
        ) : null}
        {status === 'UNDER_REVIEW' && rights.canApprove && !submittedByMe ? (
          <ActionButton id={id} action="approve" onDone={refresh} />
        ) : null}
        {status === 'UNDER_REVIEW' && rights.canApprove ? (
          <CommentedActionButton id={id} action="return-to-draft" onDone={refresh} />
        ) : null}
        {status === 'APPROVED' && rights.canOperate ? (
          <ActionButton id={id} action="open-subscription" onDone={refresh} />
        ) : null}
        {status === 'SUBSCRIPTION_OPEN' && rights.canOperate ? (
          <ActionButton id={id} action="close-subscription" onDone={refresh} />
        ) : null}
        {rights.canSeeSubscriptions && status !== 'DRAFT' && status !== 'UNDER_REVIEW' ? (
          <Button asChild variant="secondary">
            <Link href={`/issuer/subscriptions?issuanceId=${id}`}>{t('seeSubscriptions')}</Link>
          </Button>
        ) : null}
        {cancellable && rights.canCancel ? (
          <CommentedActionButton id={id} action="cancel" onDone={refresh} />
        ) : null}
      </div>
      {status === 'UNDER_REVIEW' && rights.canApprove && submittedByMe ? (
        <p className="text-sm text-muted">{t('fourEyes')}</p>
      ) : null}

      <Tabs.Root defaultValue="overview" className="flex flex-col gap-4">
        <Tabs.List aria-label={t('tabs.label')} className="flex gap-1 border-b border-border">
          {(
            [
              'overview',
              ...(rights.canInvite ? ['invitations'] : []),
              ...(rights.canReadRegistry && ALLOCATION_STATUSES.includes(status)
                ? ['allocation']
                : []),
              ...(rights.canReadRegistry && REGISTRY_STATUSES.includes(status) ? ['registry'] : []),
              'documents',
              'history',
            ] as const
          ).map((value) => (
            <Tabs.Trigger
              key={value}
              value={value}
              className="-mb-px border-b-2 border-transparent px-3 py-2 text-sm text-muted data-[state=active]:border-primary data-[state=active]:text-foreground"
            >
              {t(`tabs.${value}`)}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <Tabs.Content value="overview">
          <Overview issuance={current} />
        </Tabs.Content>
        {rights.canInvite ? (
          <Tabs.Content value="invitations">
            <InvitationsTab issuance={current} />
          </Tabs.Content>
        ) : null}
        {rights.canReadRegistry && ALLOCATION_STATUSES.includes(status) ? (
          <Tabs.Content value="allocation">
            <AllocationTab
              issuance={current}
              currentUserId={currentUserId}
              rights={{
                canPrepare: rights.canPrepareAllocation,
                canValidate: rights.canValidateAllocation,
              }}
            />
          </Tabs.Content>
        ) : null}
        {rights.canReadRegistry && REGISTRY_STATUSES.includes(status) ? (
          <Tabs.Content value="registry">
            <RegistryView issuanceId={id} totalUnits={current.terms.totalUnits} />
          </Tabs.Content>
        ) : null}
        <Tabs.Content value="documents">
          <DocumentsTab id={id} />
        </Tabs.Content>
        <Tabs.Content value="history">
          <HistoryTab id={id} />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}

function ActionButton({
  id,
  action,
  onDone,
}: {
  id: string;
  action: Action;
  onDone: (updated: IssuanceView) => Promise<void>;
}) {
  const t = useTranslations('issuances.actions');
  const idempotency = useIdempotencyKey();
  const run = useMutation({
    mutationFn: async () => {
      const params = { path: { id }, header: idempotency.header() };
      const { data, error } =
        action === 'approve'
          ? await api.POST('/api/v1/issuances/{id}/approve', { params })
          : action === 'open-subscription'
            ? await api.POST('/api/v1/issuances/{id}/open-subscription', { params })
            : await api.POST('/api/v1/issuances/{id}/close-subscription', { params });
      idempotency.answered();
      if (error) throw error;
      return data;
    },
    onSuccess: onDone,
  });
  return (
    <div className="flex flex-col gap-2">
      <ConfirmDialog
        trigger={<Button>{t(action)}</Button>}
        title={t(`${action}Title`)}
        description={t(`${action}Description`)}
        confirmLabel={t(action)}
        onConfirm={() => run.mutateAsync()}
      />
      {run.isError ? <ApiError error={run.error} /> : null}
    </div>
  );
}

function CommentedActionButton({
  id,
  action,
  onDone,
}: {
  id: string;
  action: CommentedAction;
  onDone: (updated: IssuanceView) => Promise<void>;
}) {
  const t = useTranslations('issuances.actions');
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState('');
  const idempotency = useIdempotencyKey();
  const run = useMutation({
    mutationFn: async () => {
      const options = {
        params: { path: { id }, header: idempotency.header() },
        body: { comment: comment.trim() },
      };
      const { data, error } =
        action === 'cancel'
          ? await api.POST('/api/v1/issuances/{id}/cancel', options)
          : await api.POST('/api/v1/issuances/{id}/return-to-draft', options);
      idempotency.answered();
      if (error) throw error;
      return data;
    },
    onSuccess: async (updated) => {
      setOpen(false);
      setComment('');
      await onDone(updated);
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
        <Button variant={action === 'cancel' ? 'destructive' : 'secondary'}>{t(action)}</Button>
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
              maxLength={4000}
            />
          </FormField>
          {run.isError ? <ApiError error={run.error} /> : null}
          <div className="flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button variant="secondary">{tCommon('cancel')}</Button>
            </Dialog.Close>
            <Button
              variant={action === 'cancel' ? 'destructive' : 'primary'}
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

function Overview({ issuance }: { issuance: IssuanceView }) {
  const t = useTranslations('issuances');
  const tInvestors = useTranslations('investors');
  const locale = useLocale();
  const { terms, eligibilityRules: rules } = issuance;
  const money = (value: string | null) => formatAmount(value, issuance.currency, locale);
  const yes = (value: boolean) => (value ? t('yes') : t('no'));
  const sections: [string, [string, string][]][] = [
    [
      t('wizard.stepNames.FINANCIAL'),
      [
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
          t('fields.subscriptionStartDate'),
          formatBusinessDate(terms.subscriptionStartDate, locale),
        ],
        [t('fields.subscriptionEndDate'), formatBusinessDate(terms.subscriptionEndDate, locale)],
        [t('fields.issueDate'), formatBusinessDate(terms.issueDate, locale)],
        [t('fields.maturityDate'), formatBusinessDate(terms.maturityDate, locale)],
        [t('fields.minSubscriptionAmount'), money(terms.minSubscriptionAmount)],
        [t('fields.maxAmountPerInvestor'), money(terms.maxAmountPerInvestor)],
      ],
    ],
    [
      t('wizard.stepNames.ELIGIBILITY'),
      [
        [t('fields.professionalOnly'), yes(rules.professionalOnly)],
        [t('fields.kycRequired'), yes(rules.kycRequired)],
        [t('fields.kycMinRemainingValidityDays'), String(rules.kycMinRemainingValidityDays)],
        [t('fields.excludedCountries'), rules.excludedCountries.join(', ') || '—'],
        [t('fields.allowedCountries'), rules.allowedCountries.join(', ') || t('any')],
        [
          t('fields.allowedInvestorTypes'),
          rules.allowedInvestorTypes.map((value) => tInvestors(`type.${value}`)).join(', ') ||
            t('any'),
        ],
        [
          t('fields.maxInvestors'),
          rules.maxInvestors === null ? t('any') : String(rules.maxInvestors),
        ],
        [t('fields.transfersAllowed'), yes(rules.transfersAllowed)],
        [t('fields.lockupEndDate'), formatBusinessDate(rules.lockupEndDate, locale)],
      ],
    ],
    [
      t('wizard.stepNames.SERVICING'),
      [
        [t('fields.dayCount'), terms.dayCount ? t(`dayCountOptions.${terms.dayCount}`) : '—'],
        [t('fields.roundingMethod'), t(`roundingMethodOptions.${terms.roundingMethod}`)],
        [
          t('fields.businessDayConvention'),
          t(`businessDayConventionOptions.${terms.businessDayConvention}`),
        ],
        [t('fields.recordDateOffsetBusinessDays'), String(terms.recordDateOffsetBusinessDays)],
        [t('fields.gracePeriodDays'), String(terms.gracePeriodDays)],
      ],
    ],
  ];
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {sections.map(([title, rows]) => (
        <section key={title} className="rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-2 font-heading font-semibold">{title}</h2>
          <dl className="flex flex-col text-sm">
            {rows.map(([label, value]) => (
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
      ))}
    </div>
  );
}

export function DocumentsTab({ id }: { id: string }) {
  const t = useTranslations('issuances');
  const [error, setError] = useState<unknown>(null);
  const documents = useQuery({
    queryKey: ['issuance', id, 'documents'],
    queryFn: async () => {
      const { data, error: failure } = await api.GET('/api/v1/issuances/{id}/documents', {
        params: { path: { id } },
      });
      if (failure) throw failure;
      return data;
    },
  });
  return (
    <div className="flex flex-col gap-2">
      {documents.isError ? <ApiError error={documents.error} /> : null}
      {error ? <ApiError error={error} /> : null}
      {documents.data?.length === 0 ? (
        <p className="text-sm text-muted">{t('wizard.noDocuments')}</p>
      ) : null}
      <ul className="flex flex-col divide-y divide-border text-sm">
        {(documents.data ?? []).map((item) => (
          <li key={item.documentId} className="flex items-center justify-between gap-2 py-2">
            <span>
              {item.name} · <span className="text-muted">{t(`documentKinds.${item.kind}`)}</span>
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

function HistoryTab({ id }: { id: string }) {
  const t = useTranslations('issuances');
  const tStatus = useTranslations('status.issuance');
  const format = useFormatter();
  const history = useQuery({
    queryKey: ['issuance', id, 'transitions'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/issuances/{id}/transitions', {
        params: { path: { id } },
      });
      if (error) throw error;
      return data;
    },
  });
  return (
    <div className="flex flex-col gap-2">
      {history.isError ? <ApiError error={history.error} /> : null}
      <ol className="flex flex-col gap-3 border-l border-border pl-4 text-sm">
        {(history.data ?? []).map((row, index) => (
          <li key={`${row.occurredAt}-${index}`}>
            <p className="font-medium">
              {row.fromStatus ? `${tStatus(row.fromStatus)} → ` : ''}
              {tStatus(row.toStatus)}
            </p>
            <p className="text-muted">
              {format.dateTime(new Date(row.occurredAt), {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}{' '}
              · {row.actorName ?? (row.actorUserId ? t('unknownUser') : t('system'))}
            </p>
            {row.comment ? <p className="whitespace-pre-wrap">{row.comment}</p> : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
