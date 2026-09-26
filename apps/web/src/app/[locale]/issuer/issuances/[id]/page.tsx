import { setRequestLocale } from 'next-intl/server';
import { ErrorState } from '@/components/app/error-state';
import { IssuanceDetail } from '@/features/issuances/issuance-detail';
import { getCurrentUser } from '@/lib/api/server';

export default async function IssuancePage({
  params,
}: PageProps<'/[locale]/issuer/issuances/[id]'>) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await getCurrentUser();
  const permissions = user?.permissions ?? {};
  if (!user || !permissions['issuance:read']) return <ErrorState code="PERMISSION_DENIED" />;
  return (
    <IssuanceDetail
      id={id}
      currentUserId={user.user.id}
      rights={{
        canEdit: Boolean(permissions['issuance:edit']),
        canApprove: Boolean(permissions['issuance:approve']),
        canOperate: Boolean(permissions['issuance:operate']),
        canCancel: Boolean(permissions['issuance:cancel']),
        canInvite: Boolean(permissions['invitation:manage']),
        canSeeSubscriptions: Boolean(permissions['subscription:read']),
      }}
    />
  );
}
