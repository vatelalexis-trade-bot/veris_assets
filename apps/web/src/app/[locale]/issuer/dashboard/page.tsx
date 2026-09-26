import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ErrorState } from '@/components/app/error-state';
import { PageHeader } from '@/components/app/page-header';
import { userPermissions } from '@/features/auth/require-permission';
import { IssuerDashboard } from '@/features/reporting/issuer-dashboard';

export default async function IssuerDashboardPage({
  params,
}: PageProps<'/[locale]/issuer/dashboard'>) {
  const { locale } = await params;
  setRequestLocale(locale);
  const permissions = await userPermissions();
  if (!permissions['report:read']) return <ErrorState code="PERMISSION_DENIED" />;
  const t = await getTranslations('reporting.dashboard');
  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      <IssuerDashboard />
    </>
  );
}
