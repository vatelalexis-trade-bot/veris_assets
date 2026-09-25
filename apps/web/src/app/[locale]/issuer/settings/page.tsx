import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ErrorState } from '@/components/app/error-state';
import { PageHeader } from '@/components/app/page-header';
import { OrganisationSettings } from '@/features/organisation/organisation-settings';
import { UsersPanel } from '@/features/organisation/users-panel';
import { getCurrentUser } from '@/lib/api/server';

/** Issuer settings: the organisation and its users (SPEC §13.2, §4.2). */
export default async function IssuerSettingsPage({
  params,
}: PageProps<'/[locale]/issuer/settings'>) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await getCurrentUser();
  const permissions = user?.permissions ?? {};
  if (!user || !permissions['user:read']) return <ErrorState code="PERMISSION_DENIED" />;
  const t = await getTranslations();
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={t('settings.title')} />
      {permissions['tenant-settings:manage'] ? <OrganisationSettings /> : null}
      <section aria-labelledby="users-title" className="flex flex-col gap-4">
        <h2 id="users-title" className="font-heading text-lg font-semibold">
          {t('users.title')}
        </h2>
        <UsersPanel
          currentUserId={user.user.id}
          rights={{
            canManage: Boolean(permissions['user:manage']),
            canAssignRoles: Boolean(permissions['role:assign']),
          }}
        />
      </section>
    </div>
  );
}
