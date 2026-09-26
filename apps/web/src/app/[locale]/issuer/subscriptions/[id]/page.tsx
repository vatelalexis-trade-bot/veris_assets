import { setRequestLocale } from 'next-intl/server';
import { ErrorState } from '@/components/app/error-state';
import { userPermissions } from '@/features/auth/require-permission';
import { SubscriptionDetail } from '@/features/subscriptions/subscription-detail';

export default async function SubscriptionPage({
  params,
}: PageProps<'/[locale]/issuer/subscriptions/[id]'>) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const permissions = await userPermissions();
  if (!permissions['subscription:read']) return <ErrorState code="PERMISSION_DENIED" />;
  return (
    <SubscriptionDetail
      id={id}
      rights={{
        investor: false,
        canReview: Boolean(permissions['subscription:review']),
        canApprove: Boolean(permissions['subscription:approve']),
        canCancel: Boolean(permissions['subscription:cancel']),
      }}
    />
  );
}
