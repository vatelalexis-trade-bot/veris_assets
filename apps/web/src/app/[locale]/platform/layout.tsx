import { setRequestLocale } from 'next-intl/server';
import { AppShell } from '@/components/app/app-shell';

export default async function Layout({ children, params }: LayoutProps<'/[locale]/platform'>) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <AppShell portalId="platform">{children}</AppShell>;
}
