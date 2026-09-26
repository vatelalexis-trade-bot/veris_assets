import { setRequestLocale } from 'next-intl/server';
import { ErrorState } from '@/components/app/error-state';
import { userPermissions } from '@/features/auth/require-permission';
import { TransferDetail } from '@/features/transfers/transfer-detail';

export default async function TransferPage({
  params,
}: PageProps<'/[locale]/issuer/transfers/[id]'>) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const permissions = await userPermissions();
  if (!permissions['transfer:read']) return <ErrorState code="PERMISSION_DENIED" />;
  return (
    <TransferDetail
      id={id}
      rights={{
        investor: false,
        canApprove: Boolean(permissions['transfer:approve']),
        canCancel: Boolean(permissions['transfer:cancel']),
      }}
    />
  );
}
