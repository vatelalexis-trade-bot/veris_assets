import { setRequestLocale } from 'next-intl/server';
import { ErrorState } from '@/components/app/error-state';
import { DistributionDetail } from '@/features/distributions/distribution-detail';
import { getCurrentUser } from '@/lib/api/server';

export default async function DistributionPage({
  params,
}: PageProps<'/[locale]/issuer/distributions/[id]'>) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await getCurrentUser();
  const permissions = user?.permissions ?? {};
  if (!user || !permissions['distribution:read']) return <ErrorState code="PERMISSION_DENIED" />;
  return (
    <DistributionDetail
      id={id}
      rights={{
        investor: false,
        canPrepare: Boolean(permissions['distribution:prepare']),
        canApprove: Boolean(permissions['distribution:approve']),
        canCancel: Boolean(permissions['distribution:cancel']),
        canConfirmPayment: Boolean(permissions['payment:confirm']),
        currentUserId: user.user.id,
      }}
    />
  );
}
