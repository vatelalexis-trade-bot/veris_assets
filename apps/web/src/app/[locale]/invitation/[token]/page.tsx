import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ErrorState } from '@/components/app/error-state';
import { AuthCard } from '@/features/auth/auth-card';
import { AcceptInvitationForm } from '@/features/auth/password-forms';
import { apiFromServer } from '@/lib/api/server';
import type { operations } from '@/lib/api/schema';

type Preview =
  operations['InvitationAcceptanceController_preview']['responses'][200]['content']['application/json'];

export default async function InvitationPage({
  params,
}: PageProps<'/[locale]/invitation/[token]'>) {
  const { locale, token } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('auth');
  const response = await apiFromServer(`/api/v1/auth/invitations/${encodeURIComponent(token)}`);
  if (!response.ok) {
    return (
      <AuthCard title={t('invitation.title')}>
        <ErrorState code="INVITATION_INVALID_OR_EXPIRED" />
      </AuthCard>
    );
  }
  const invitation = (await response.json()) as Preview;
  const role = t(`roles.${invitation.roleCode}`);
  return (
    <AuthCard title={t('invitation.title')}>
      <p className="text-sm text-foreground">
        {invitation.tenantName
          ? t('invitation.tenantInvitation', {
              name: invitation.name,
              tenant: invitation.tenantName,
              role,
            })
          : t('invitation.platformInvitation', { name: invitation.name, role })}
      </p>
      <p className="text-sm text-muted">
        {t('invitation.choosePassword', { email: invitation.email })}
      </p>
      <AcceptInvitationForm token={token} />
    </AuthCard>
  );
}
