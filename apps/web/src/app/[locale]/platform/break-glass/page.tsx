import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ErrorState } from '@/components/app/error-state';
import { PageHeader } from '@/components/app/page-header';
import { userPermissions } from '@/features/auth/require-permission';
import { BreakGlassForm } from '@/features/break-glass/break-glass-form';

export default async function BreakGlassPage({
  params,
}: PageProps<'/[locale]/platform/break-glass'>) {
  const { locale } = await params;
  setRequestLocale(locale);
  const permissions = await userPermissions();
  if (!permissions['break-glass:request']) return <ErrorState code="PERMISSION_DENIED" />;
  const t = await getTranslations('breakGlass');
  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      <BreakGlassForm />
    </>
  );
}
