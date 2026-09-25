import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ErrorState } from '@/components/app/error-state';
import { AuthCard } from '@/features/auth/auth-card';
import { ResetPasswordForm } from '@/features/auth/password-forms';

export default async function ResetPasswordPage({
  params,
  searchParams,
}: PageProps<'/[locale]/reset-password'>) {
  const { locale } = await params;
  setRequestLocale(locale);
  const token = (await searchParams).token;
  const t = await getTranslations('auth.reset');
  return (
    <AuthCard title={t('title')}>
      {typeof token === 'string' && token.length > 0 ? (
        <ResetPasswordForm token={token} />
      ) : (
        <ErrorState code="RESET_TOKEN_INVALID_OR_EXPIRED" />
      )}
    </AuthCard>
  );
}
