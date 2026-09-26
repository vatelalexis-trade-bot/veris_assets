import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ErrorState } from '@/components/app/error-state';
import { PageHeader } from '@/components/app/page-header';
import { userPermissions } from '@/features/auth/require-permission';
import { DistributionsList } from '@/features/distributions/distributions-list';

/** The investor's distributions (SPEC §14.2). */
export default async function OwnDistributionsPage({
  params,
}: PageProps<'/[locale]/portal/distributions'>) {
  const { locale } = await params;
  setRequestLocale(locale);
  const permissions = await userPermissions();
  if (!permissions['distribution:read']) return <ErrorState code="PERMISSION_DENIED" />;
  const t = await getTranslations('distributions');
  return (
    <>
      <PageHeader title={t('ownTitle')} description={t('ownDescription')} />
      <DistributionsList basePath="/portal/distributions" staff={false} />
    </>
  );
}
