import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AuthCard } from '@/features/auth/auth-card';
import { safeNextPath } from '@/features/auth/destination';
import { SecondFactor } from '@/features/auth/second-factor';

export default async function SecondFactorPage({
  params,
  searchParams,
}: PageProps<'/[locale]/login/mfa'>) {
  const { locale } = await params;
  setRequestLocale(locale);
  const next = safeNextPath((await searchParams).next as string | undefined);
  const t = await getTranslations('auth.mfa');
  return (
    <AuthCard title={t('title')}>
      <SecondFactor next={next} />
    </AuthCard>
  );
}
