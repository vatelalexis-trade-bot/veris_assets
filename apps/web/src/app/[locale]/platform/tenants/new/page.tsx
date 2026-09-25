import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ErrorState } from '@/components/app/error-state';
import { PageHeader } from '@/components/app/page-header';
import { userPermissions } from '@/features/auth/require-permission';
import { TenantCreateForm } from '@/features/tenants/tenant-create-form';

export default async function NewTenantPage({
  params,
}: PageProps<'/[locale]/platform/tenants/new'>) {
  const { locale } = await params;
  setRequestLocale(locale);
  if (!(await userPermissions())['tenant:manage']) return <ErrorState code="PERMISSION_DENIED" />;
  const t = await getTranslations('tenants');
  return (
    <>
      <PageHeader title={t('new')} />
      <TenantCreateForm />
    </>
  );
}
