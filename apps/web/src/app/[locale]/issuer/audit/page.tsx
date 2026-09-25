import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ErrorState } from '@/components/app/error-state';
import { PageHeader } from '@/components/app/page-header';
import { userPermissions } from '@/features/auth/require-permission';
import { AuditViewer } from '@/features/audit/audit-viewer';

/** Audit log of the organisation (SPEC §17, §4.6). */
export default async function AuditPage({ params }: PageProps<'/[locale]/issuer/audit'>) {
  const { locale } = await params;
  setRequestLocale(locale);
  const permissions = await userPermissions();
  if (!permissions['audit:read']) return <ErrorState code="PERMISSION_DENIED" />;
  const t = await getTranslations('audit');
  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      <AuditViewer />
    </>
  );
}
