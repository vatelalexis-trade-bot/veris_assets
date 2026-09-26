import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ErrorState } from '@/components/app/error-state';
import { PageHeader } from '@/components/app/page-header';
import { userPermissions } from '@/features/auth/require-permission';
import { SubscriptionsList } from '@/features/subscriptions/subscriptions-list';

/** Subscriptions of the organisation, to review and decide (SPEC §13.2, P11-3). */
export default async function SubscriptionsPage({
  params,
}: PageProps<'/[locale]/issuer/subscriptions'>) {
  const { locale } = await params;
  setRequestLocale(locale);
  const permissions = await userPermissions();
  if (!permissions['subscription:read']) return <ErrorState code="PERMISSION_DENIED" />;
  const t = await getTranslations('subscriptions');
  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      <SubscriptionsList basePath="/issuer/subscriptions" showInvestor />
    </>
  );
}
