import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ErrorState } from '@/components/app/error-state';
import { PageHeader } from '@/components/app/page-header';
import { userPermissions } from '@/features/auth/require-permission';
import { DistributionsList } from '@/features/distributions/distributions-list';

/** Distributions of the organisation (SPEC §12, §13.2). */
export default async function DistributionsPage({
  params,
}: PageProps<'/[locale]/issuer/distributions'>) {
  const { locale } = await params;
  setRequestLocale(locale);
  const permissions = await userPermissions();
  if (!permissions['distribution:read']) return <ErrorState code="PERMISSION_DENIED" />;
  const t = await getTranslations('distributions');
  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      <DistributionsList basePath="/issuer/distributions" staff />
    </>
  );
}
