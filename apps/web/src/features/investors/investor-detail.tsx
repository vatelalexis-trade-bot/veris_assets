'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { ApiError } from '@/components/app/api-error';
import { PageHeader } from '@/components/app/page-header';
import { StatusBadge } from '@/components/app/status-badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { DocumentsTable } from '@/features/documents/documents-table';
import { EligibilityPanel } from '@/features/eligibility/eligibility-panel';
import { UploadForm } from '@/features/documents/upload-form';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api/client';
import { CommentsPanel } from './comments-panel';
import { bodyOf, InvestorFields, valuesOf, type InvestorFormValues } from './investor-form';
import { KycPanel } from './kyc-panel';
import { PeoplePanel } from './people-panel';
import type { InvestorView } from './types';

export interface InvestorRights {
  canManage: boolean;
  canReadPersonalData: boolean;
  canPrepareKyc: boolean;
  canDecideKyc: boolean;
  canComment: boolean;
  canUpload: boolean;
  canReadEligibility: boolean;
  canDecideEligibility: boolean;
}

/** One investor: profile, KYC/KYB, representatives and owners, documents, compliance comments. */
export function InvestorDetail({ id, rights }: { id: string; rights: InvestorRights }) {
  const t = useTranslations('investors');
  const queryClient = useQueryClient();
  const investor = useQuery({
    queryKey: ['investor', id],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/investors/{id}', { params: { path: { id } } });
      if (error) throw error;
      return data;
    },
  });
  const save = useMutation({
    mutationFn: async (values: InvestorFormValues) => {
      const { data, error } = await api.PATCH('/api/v1/investors/{id}', {
        params: { path: { id } },
        headers: { 'If-Match': `"${investor.data!.version}"` },
        body: bodyOf(values),
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(['investor', id], updated);
      void queryClient.invalidateQueries({ queryKey: ['investors'] });
    },
  });

  if (investor.isError) return <ApiError error={investor.error} />;
  if (!investor.data) return <Skeleton className="h-40 w-full" />;
  const current = investor.data;

  return (
    <div className="flex flex-col gap-6">
      <Link href="/issuer/investors" className="text-sm text-primary-text hover:underline">
        ← {t('back')}
      </Link>
      <PageHeader
        title={current.legalName}
        description={`${t(`classification.${current.classification}`)} · ${current.countryOfIncorporation} · ${t('recipientCode', { code: current.recipientCode })}`}
        actions={<StatusBadge domain="kyc" status={current.kycStatus} />}
      />
      <ProfileForm
        key={current.version}
        investor={current}
        save={save}
        editable={rights.canManage}
      />
      <KycPanel
        investorId={id}
        rights={{ canPrepare: rights.canPrepareKyc, canDecide: rights.canDecideKyc }}
      />
      {rights.canReadEligibility ? (
        <EligibilityPanel
          investorId={id}
          status={current.eligibilityStatus}
          rights={{ canRead: rights.canReadEligibility, canDecide: rights.canDecideEligibility }}
        />
      ) : null}
      {rights.canReadPersonalData ? (
        <PeoplePanel investorId={id} canManage={rights.canManage} />
      ) : null}
      <section aria-labelledby="documents-title" className="flex flex-col gap-3">
        <h2 id="documents-title" className="font-heading text-lg font-semibold">
          {t('documents')}
        </h2>
        <DocumentsTable investorId={id} />
        {rights.canUpload ? (
          <UploadForm
            investorId={id}
            types={['KYC_EVIDENCE', 'INVESTOR_DOCUMENT']}
            chooseConfidentiality
          />
        ) : null}
      </section>
      <CommentsPanel investorId={id} canComment={rights.canComment} />
    </div>
  );
}

function ProfileForm({
  investor,
  save,
  editable,
}: {
  investor: InvestorView;
  save: UseMutationResult<InvestorView, unknown, InvestorFormValues>;
  editable: boolean;
}) {
  const t = useTranslations('investors');
  const tCommon = useTranslations('common');
  const [values, setValues] = useState(() => valuesOf(investor));
  return (
    <form
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        save.mutate(values);
      }}
      className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5"
      noValidate
    >
      <h2 className="font-heading text-lg font-semibold">{t('profile')}</h2>
      <InvestorFields values={values} onChange={setValues} disabled={!editable} />
      {save.isError ? <ApiError error={save.error} /> : null}
      {save.isSuccess ? (
        <p role="status" className="text-sm text-success">
          {tCommon('saved')}
        </p>
      ) : null}
      {editable ? (
        <Button
          type="submit"
          className="self-start"
          disabled={save.isPending || !values.legalName.trim()}
        >
          {tCommon('save')}
        </Button>
      ) : null}
    </form>
  );
}
