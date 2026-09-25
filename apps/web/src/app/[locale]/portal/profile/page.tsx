import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ErrorState } from '@/components/app/error-state';
import { PageHeader } from '@/components/app/page-header';
import { userPermissions } from '@/features/auth/require-permission';
import { OwnProfile } from '@/features/investor-portal/own-profile';

export default async function ProfilePage({ params }: PageProps<'/[locale]/portal/profile'>) {
  const { locale } = await params;
  setRequestLocale(locale);
  const permissions = await userPermissions();
  if (!permissions['profile:manage']) return <ErrorState code="PERMISSION_DENIED" />;
  const t = await getTranslations('profile');
  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      <OwnProfile />
    </>
  );
}
