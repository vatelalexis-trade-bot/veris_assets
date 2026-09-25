import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AuthCard } from '@/features/auth/auth-card';
import { PORTAL_PATHS, safeNextPath } from '@/features/auth/destination';
import { SignIn, type DemoAccounts } from '@/features/auth/sign-in';
import { redirect } from '@/i18n/navigation';
import { apiFromServer, getCurrentUser } from '@/lib/api/server';

export default async function LoginPage({ params, searchParams }: PageProps<'/[locale]/login'>) {
  const { locale } = await params;
  setRequestLocale(locale);
  const next = safeNextPath((await searchParams).next as string | undefined);
  const user = await getCurrentUser();
  if (user) redirect({ href: next ?? PORTAL_PATHS[user.homePortal], locale });

  // The demonstration accounts are only listed when the API runs in demo mode (404 otherwise).
  const demoResponse = await apiFromServer('/api/v1/auth/demo-accounts');
  const demo = demoResponse.ok ? ((await demoResponse.json()) as DemoAccounts) : null;
  const t = await getTranslations('auth.signIn');
  return (
    <AuthCard title={t('title')} wide>
      <SignIn demo={demo} next={next} />
    </AuthCard>
  );
}
