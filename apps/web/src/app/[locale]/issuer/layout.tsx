import { setRequestLocale } from 'next-intl/server';
import { AppShell } from '@/components/app/app-shell';
import { requirePortalAccess } from '@/features/auth/require-portal-access';

export default async function Layout({ children, params }: LayoutProps<'/[locale]/issuer'>) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requirePortalAccess('issuer', locale);
  return (
    <AppShell
      portalId="issuer"
      user={{
        name: user.user.name,
        tenantName: user.tenant?.legalName ?? null,
        permissions: Object.keys(user.permissions),
      }}
    >
      {children}
    </AppShell>
  );
}
