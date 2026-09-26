import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ErrorState } from '@/components/app/error-state';
import { PageHeader } from '@/components/app/page-header';
import { userPermissions } from '@/features/auth/require-permission';
import { Portfolio } from '@/features/transfers/portfolio';

/** The investor's positions and transfer requests (SPEC §14.2, §11). */
export default async function PortfolioPage({ params }: PageProps<'/[locale]/portal/portfolio'>) {
  const { locale } = await params;
  setRequestLocale(locale);
  const permissions = await userPermissions();
  if (!permissions['registry:read']) return <ErrorState code="PERMISSION_DENIED" />;
  const t = await getTranslations('transfers.portfolio');
  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      <Portfolio canTransfer={Boolean(permissions['transfer:request'])} />
    </>
  );
}
