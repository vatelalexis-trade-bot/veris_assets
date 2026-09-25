import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import type { PortalId } from '@/features/navigation/portals';
import { Link } from '@/i18n/navigation';
import { DemoBanner } from './demo-banner';
import { LanguageSwitcher } from './language-switcher';
import { Logo } from './logo';
import { PortalNavigation } from './portal-navigation';

/** Common frame of the three portals (SPEC §23.2): banner, sidebar, header and content. */
export function AppShell({ portalId, children }: { portalId: PortalId; children: ReactNode }) {
  const t = useTranslations();
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2"
      >
        {t('common.skipToContent')}
      </a>
      <DemoBanner />
      <div className="flex flex-1 flex-col md:flex-row">
        <aside className="flex flex-wrap items-center justify-between border-b border-border bg-surface md:w-64 md:flex-col md:flex-nowrap md:items-stretch md:justify-start md:border-r md:border-b-0">
          <Link
            href="/"
            className="block bg-background md:px-4 md:py-3"
            aria-label={t('common.backToHome')}
          >
            <Logo />
          </Link>
          <PortalNavigation portalId={portalId} />
        </aside>
        <div className="flex flex-1 flex-col">
          <header className="flex items-center justify-between gap-4 border-b border-border px-6 py-3">
            <p className="font-heading text-sm font-semibold text-foreground">
              {t(`portals.${portalId}`)}
            </p>
            <LanguageSwitcher />
          </header>
          <main id="main-content" tabIndex={-1} className="flex-1 px-6 py-6">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
