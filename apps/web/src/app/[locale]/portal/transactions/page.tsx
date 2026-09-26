import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ErrorState } from '@/components/app/error-state';
import { PageHeader } from '@/components/app/page-header';
import { userPermissions } from '@/features/auth/require-permission';
import { Transactions } from '@/features/reporting/transactions';

export default async function TransactionsPage({
  params,
}: PageProps<'/[locale]/portal/transactions'>) {
  const { locale } = await params;
  setRequestLocale(locale);
  const permissions = await userPermissions();
  if (!permissions['registry:read']) return <ErrorState code="PERMISSION_DENIED" />;
  const t = await getTranslations('reporting.transactions');
  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      <Transactions />
    </>
  );
}
