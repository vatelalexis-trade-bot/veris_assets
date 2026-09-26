import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ErrorState } from '@/components/app/error-state';
import { PageHeader } from '@/components/app/page-header';
import { userPermissions } from '@/features/auth/require-permission';
import { TransfersList } from '@/features/transfers/transfers-list';

/** Transfer requests of the organisation, to review (SPEC §11.1). */
export default async function TransfersPage({ params }: PageProps<'/[locale]/issuer/transfers'>) {
  const { locale } = await params;
  setRequestLocale(locale);
  const permissions = await userPermissions();
  if (!permissions['transfer:read']) return <ErrorState code="PERMISSION_DENIED" />;
  const t = await getTranslations('transfers');
  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      <TransfersList basePath="/issuer/transfers" staff />
    </>
  );
}
