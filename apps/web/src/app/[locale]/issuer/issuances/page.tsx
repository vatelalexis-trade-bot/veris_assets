import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ErrorState } from '@/components/app/error-state';
import { PageHeader } from '@/components/app/page-header';
import { userPermissions } from '@/features/auth/require-permission';
import { IssuancesList } from '@/features/issuances/issuances-list';

export default async function IssuancesPage({ params }: PageProps<'/[locale]/issuer/issuances'>) {
  const { locale } = await params;
  setRequestLocale(locale);
  const permissions = await userPermissions();
  if (!permissions['issuance:read']) return <ErrorState code="PERMISSION_DENIED" />;
  const t = await getTranslations('issuances');
  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      <IssuancesList
        canCreate={Boolean(permissions['issuance:edit'])}
        basePath="/issuer/issuances"
      />
    </>
  );
}
