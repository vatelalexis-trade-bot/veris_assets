import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ErrorState } from '@/components/app/error-state';
import { PageHeader } from '@/components/app/page-header';
import { userPermissions } from '@/features/auth/require-permission';
import { TenantsList } from '@/features/tenants/tenants-list';

export default async function TenantsPage({ params }: PageProps<'/[locale]/platform/tenants'>) {
  const { locale } = await params;
  setRequestLocale(locale);
  const permissions = await userPermissions();
  if (!permissions['tenant:read']) return <ErrorState code="PERMISSION_DENIED" />;
  const t = await getTranslations('tenants');
  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      <TenantsList canManage={Boolean(permissions['tenant:manage'])} />
    </>
  );
}
