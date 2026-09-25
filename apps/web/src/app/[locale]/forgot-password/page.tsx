import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AuthCard } from '@/features/auth/auth-card';
import { ForgotPasswordForm } from '@/features/auth/password-forms';

export default async function ForgotPasswordPage({
  params,
}: PageProps<'/[locale]/forgot-password'>) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('auth.forgot');
  return (
    <AuthCard title={t('title')}>
      <ForgotPasswordForm />
    </AuthCard>
  );
}
