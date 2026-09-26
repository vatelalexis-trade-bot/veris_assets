import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ErrorState } from '@/components/app/error-state';
import { PageHeader } from '@/components/app/page-header';
import { userPermissions } from '@/features/auth/require-permission';
import { OpportunitiesList } from '@/features/subscriptions/opportunities-list';

/** Issuances the investor is invited to (SPEC §14.2). */
export default async function OpportunitiesPage({
  params,
}: PageProps<'/[locale]/portal/opportunities'>) {
  const { locale } = await params;
  setRequestLocale(locale);
  const permissions = await userPermissions();
  if (!permissions['issuance:read']) return <ErrorState code="PERMISSION_DENIED" />;
  const t = await getTranslations('subscriptions.opportunities');
  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      <OpportunitiesList />
    </>
  );
}
