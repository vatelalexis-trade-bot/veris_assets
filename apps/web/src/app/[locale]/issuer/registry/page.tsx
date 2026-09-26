import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ErrorState } from '@/components/app/error-state';
import { PageHeader } from '@/components/app/page-header';
import { getCurrentUser } from '@/lib/api/server';
import { RegistryPage } from '@/features/registry/registry-page';

/** Registry of the organisation (SPEC §10.2, §13.2): positions and the append-only ledger. */
export default async function IssuerRegistryPage({
  params,
}: PageProps<'/[locale]/issuer/registry'>) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await getCurrentUser();
  const permissions = user?.permissions ?? {};
  if (!user || !permissions['registry:read']) return <ErrorState code="PERMISSION_DENIED" />;
  const t = await getTranslations('registry');
  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      <RegistryPage
        corrections={{
          canRequest: Boolean(permissions['registry-correction:request']),
          canApprove: Boolean(permissions['registry-correction:approve']),
          currentUserId: user.user.id,
        }}
      />
    </>
  );
}
