import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ErrorState } from '@/components/app/error-state';
import { PageHeader } from '@/components/app/page-header';
import { userPermissions } from '@/features/auth/require-permission';
import { PlatformMetrics } from '@/features/reporting/platform-metrics';

export default async function PlatformMetricsPage({
  params,
}: PageProps<'/[locale]/platform/metrics'>) {
  const { locale } = await params;
  setRequestLocale(locale);
  const permissions = await userPermissions();
  if (!permissions['platform-metrics:read']) return <ErrorState code="PERMISSION_DENIED" />;
  const t = await getTranslations('reporting.platform');
  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      <PlatformMetrics />
    </>
  );
}
