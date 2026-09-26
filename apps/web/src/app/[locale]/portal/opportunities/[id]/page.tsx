import { setRequestLocale } from 'next-intl/server';
import { ErrorState } from '@/components/app/error-state';
import { userPermissions } from '@/features/auth/require-permission';
import { OpportunityDetail } from '@/features/subscriptions/opportunity-detail';

export default async function OpportunityPage({
  params,
}: PageProps<'/[locale]/portal/opportunities/[id]'>) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const permissions = await userPermissions();
  if (!permissions['issuance:read']) return <ErrorState code="PERMISSION_DENIED" />;
  return <OpportunityDetail id={id} canSubscribe={Boolean(permissions['subscription:create'])} />;
}
