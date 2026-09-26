import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ErrorState } from '@/components/app/error-state';
import { PageHeader } from '@/components/app/page-header';
import { userPermissions } from '@/features/auth/require-permission';
import { Exports } from '@/features/reporting/exports';

export default async function ReportsPage({ params }: PageProps<'/[locale]/issuer/reports'>) {
  const { locale } = await params;
  setRequestLocale(locale);
  const permissions = await userPermissions();
  if (!permissions['report:export']) return <ErrorState code="PERMISSION_DENIED" />;
  const t = await getTranslations('reporting.exports');
  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      <Exports />
    </>
  );
}
