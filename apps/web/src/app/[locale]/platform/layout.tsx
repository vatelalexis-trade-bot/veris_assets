import { setRequestLocale } from 'next-intl/server';
import { AppShell } from '@/components/app/app-shell';
import { requirePortalAccess } from '@/features/auth/require-portal-access';

export default async function Layout({ children, params }: LayoutProps<'/[locale]/platform'>) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requirePortalAccess('platform', locale);
  return (
    <AppShell
      portalId="platform"
      user={{ name: user.user.name, tenantName: user.tenant?.legalName ?? null }}
    >
      {children}
    </AppShell>
  );
}
