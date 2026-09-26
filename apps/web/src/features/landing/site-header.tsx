import { ArrowRight, LogIn } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { LanguageSwitcher } from '@/components/app/language-switcher';
import { Logo } from '@/components/app/logo';
import { Button } from '@/components/ui/button';
import { PORTAL_PATHS } from '@/features/auth/destination';
import { Link } from '@/i18n/navigation';
import type { getCurrentUser } from '@/lib/api/server';

const SECTIONS = ['platform', 'lifecycle', 'security', 'calculator', 'contact'] as const;

/** Header of the public site: anchors to the sections, language, and the way into the portals. */
export async function SiteHeader({ user }: { user: Awaited<ReturnType<typeof getCurrentUser>> }) {
  const t = await getTranslations('landing.nav');
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-18 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" aria-label="Virtus Assets">
          <Logo className="h-12 w-32 sm:h-14 sm:w-40" />
        </Link>
        <nav aria-label={t('label')} className="hidden items-center gap-7 text-sm lg:flex">
          {SECTIONS.map((section) => (
            <a
              key={section}
              href={`#${section}`}
              className="text-muted transition-colors hover:text-foreground"
            >
              {t(section)}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2 sm:gap-3">
          <LanguageSwitcher />
          <Button asChild size="sm">
            {user ? (
              <Link href={PORTAL_PATHS[user.homePortal]} aria-label={t('openPortal')}>
                <span className="hidden sm:inline">{t('openPortal')}</span>
                <ArrowRight aria-hidden="true" />
              </Link>
            ) : (
              <Link href="/login" aria-label={t('signIn')}>
                <LogIn aria-hidden="true" />
                <span className="hidden sm:inline">{t('signIn')}</span>
              </Link>
            )}
          </Button>
        </div>
      </div>
    </header>
  );
}
