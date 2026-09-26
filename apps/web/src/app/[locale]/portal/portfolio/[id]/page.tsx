import { setRequestLocale } from 'next-intl/server';
import { ErrorState } from '@/components/app/error-state';
import { userPermissions } from '@/features/auth/require-permission';
import { PositionDetail } from '@/features/reporting/position-detail';

export default async function PositionPage({
  params,
}: PageProps<'/[locale]/portal/portfolio/[id]'>) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const permissions = await userPermissions();
  if (!permissions['registry:read']) return <ErrorState code="PERMISSION_DENIED" />;
  return <PositionDetail id={id} />;
}
