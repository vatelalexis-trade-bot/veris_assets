import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AuthCard } from '@/features/auth/auth-card';
import { PORTAL_PATHS } from '@/features/auth/destination';
import { MfaSetup } from '@/features/auth/mfa-setup';
import { redirect } from '@/i18n/navigation';
import { getCurrentUser } from '@/lib/api/server';

export default async function MfaSetupPage({ params }: PageProps<'/[locale]/login/mfa-setup'>) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await getCurrentUser();
  if (!user) redirect({ href: '/login', locale });
  else if (user.mfa.enabled) redirect({ href: PORTAL_PATHS[user.homePortal], locale });
  const t = await getTranslations('auth.mfaSetup');
  return (
    <AuthCard title={t('title')}>
      <MfaSetup />
    </AuthCard>
  );
}
