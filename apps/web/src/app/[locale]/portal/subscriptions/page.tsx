import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ErrorState } from '@/components/app/error-state';
import { PageHeader } from '@/components/app/page-header';
import { userPermissions } from '@/features/auth/require-permission';
import { SubscriptionsList } from '@/features/subscriptions/subscriptions-list';

/** The investor's own subscriptions (SPEC §14.2). */
export default async function OwnSubscriptionsPage({
  params,
}: PageProps<'/[locale]/portal/subscriptions'>) {
  const { locale } = await params;
  setRequestLocale(locale);
  const permissions = await userPermissions();
  if (!permissions['subscription:read']) return <ErrorState code="PERMISSION_DENIED" />;
  const t = await getTranslations('subscriptions');
  return (
    <>
      <PageHeader title={t('ownTitle')} description={t('ownDescription')} />
      <SubscriptionsList basePath="/portal/subscriptions" showInvestor={false} />
    </>
  );
}
