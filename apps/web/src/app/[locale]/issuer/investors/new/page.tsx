import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ErrorState } from '@/components/app/error-state';
import { PageHeader } from '@/components/app/page-header';
import { userPermissions } from '@/features/auth/require-permission';
import { InvestorCreateForm } from '@/features/investors/investor-create-form';

export default async function NewInvestorPage({
  params,
}: PageProps<'/[locale]/issuer/investors/new'>) {
  const { locale } = await params;
  setRequestLocale(locale);
  const permissions = await userPermissions();
  if (!permissions['investor:manage']) return <ErrorState code="PERMISSION_DENIED" />;
  const t = await getTranslations('investors');
  return (
    <>
      <PageHeader title={t('new')} description={t('newDescription')} />
      <InvestorCreateForm />
    </>
  );
}
