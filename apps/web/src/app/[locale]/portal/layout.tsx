import { setRequestLocale } from 'next-intl/server';
import { AppShell } from '@/components/app/app-shell';

export default async function Layout({ children, params }: LayoutProps<'/[locale]/portal'>) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <AppShell portalId="investor">{children}</AppShell>;
}
