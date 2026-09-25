import { setRequestLocale } from 'next-intl/server';
import { ErrorState } from '@/components/app/error-state';
import { userPermissions } from '@/features/auth/require-permission';
import { InvestorDetail } from '@/features/investors/investor-detail';

export default async function InvestorPage({
  params,
}: PageProps<'/[locale]/issuer/investors/[id]'>) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const permissions = await userPermissions();
  if (!permissions['investor:read']) return <ErrorState code="PERMISSION_DENIED" />;
  return (
    <InvestorDetail
      id={id}
      rights={{
        canManage: Boolean(permissions['investor:manage']),
        canReadPersonalData: Boolean(permissions['investor-personal-data:read']),
        canPrepareKyc: Boolean(permissions['kyc:prepare']),
        canDecideKyc: Boolean(permissions['kyc:decide']),
        canComment: Boolean(permissions['compliance-comment:create']),
        canUpload: Boolean(permissions['document:upload']),
      }}
    />
  );
}
