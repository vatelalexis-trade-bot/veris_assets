import { setRequestLocale } from 'next-intl/server';
import { ErrorState } from '@/components/app/error-state';
import { DistributionDetail } from '@/features/distributions/distribution-detail';
import { getCurrentUser } from '@/lib/api/server';

export default async function OwnDistributionPage({
  params,
}: PageProps<'/[locale]/portal/distributions/[id]'>) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await getCurrentUser();
  if (!user || !user.permissions['distribution:read'])
    return <ErrorState code="PERMISSION_DENIED" />;
  return (
    <DistributionDetail
      id={id}
      rights={{
        investor: true,
        canPrepare: false,
        canApprove: false,
        canCancel: false,
        canConfirmPayment: false,
        currentUserId: user.user.id,
      }}
    />
  );
}
