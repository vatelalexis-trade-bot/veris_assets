import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ErrorState } from '@/components/app/error-state';
import { PageHeader } from '@/components/app/page-header';
import { userPermissions } from '@/features/auth/require-permission';
import { TransferForm } from '@/features/transfers/transfer-form';

export default async function NewTransferPage({
  params,
  searchParams,
}: PageProps<'/[locale]/portal/transfers/new'>) {
  const { locale } = await params;
  setRequestLocale(locale);
  const permissions = await userPermissions();
  const issuanceId = (await searchParams).issuanceId;
  if (!permissions['transfer:request']) return <ErrorState code="PERMISSION_DENIED" />;
  if (typeof issuanceId !== 'string') return <ErrorState code="RESOURCE_NOT_FOUND" />;
  const t = await getTranslations('transfers.form');
  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      <TransferForm issuanceId={issuanceId} />
    </>
  );
}
