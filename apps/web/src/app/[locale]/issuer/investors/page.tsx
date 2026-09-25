import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ErrorState } from '@/components/app/error-state';
import { PageHeader } from '@/components/app/page-header';
import { userPermissions } from '@/features/auth/require-permission';
import { InvestorsList } from '@/features/investors/investors-list';

export default async function InvestorsPage({ params }: PageProps<'/[locale]/issuer/investors'>) {
  const { locale } = await params;
  setRequestLocale(locale);
  const permissions = await userPermissions();
  if (!permissions['investor:read']) return <ErrorState code="PERMISSION_DENIED" />;
  const t = await getTranslations('investors');
  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      <InvestorsList canManage={Boolean(permissions['investor:manage'])} />
    </>
  );
}
