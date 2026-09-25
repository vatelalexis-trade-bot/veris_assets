import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ErrorState } from '@/components/app/error-state';
import { PageHeader } from '@/components/app/page-header';
import { userPermissions } from '@/features/auth/require-permission';
import { IssuanceCreateForm } from '@/features/issuances/issuance-create-form';

export default async function NewIssuancePage({
  params,
}: PageProps<'/[locale]/issuer/issuances/new'>) {
  const { locale } = await params;
  setRequestLocale(locale);
  const permissions = await userPermissions();
  if (!permissions['issuance:edit']) return <ErrorState code="PERMISSION_DENIED" />;
  const t = await getTranslations('issuances');
  return (
    <>
      <PageHeader title={t('new')} description={t('newDescription')} />
      <IssuanceCreateForm />
    </>
  );
}
