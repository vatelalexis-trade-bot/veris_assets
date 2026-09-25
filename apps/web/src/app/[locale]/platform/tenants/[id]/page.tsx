import { setRequestLocale } from 'next-intl/server';
import { ErrorState } from '@/components/app/error-state';
import { userPermissions } from '@/features/auth/require-permission';
import { TenantDetail } from '@/features/tenants/tenant-detail';

export default async function TenantPage({
  params,
  searchParams,
}: PageProps<'/[locale]/platform/tenants/[id]'>) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const permissions = await userPermissions();
  if (!permissions['tenant:read']) return <ErrorState code="PERMISSION_DENIED" />;
  const invited = (await searchParams).invited;
  return (
    <TenantDetail
      id={id}
      canManage={Boolean(permissions['tenant:manage'])}
      invited={typeof invited === 'string' ? invited : undefined}
    />
  );
}
