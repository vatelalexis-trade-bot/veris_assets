import { ArrowRight, LogIn } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { LanguageSwitcher } from '@/components/app/language-switcher';
import { Logo } from '@/components/app/logo';
import { Button } from '@/components/ui/button';
import { PORTAL_PATHS } from '@/features/auth/destination';
import { Link } from '@/i18n/navigation';
import type { getCurrentUser } from '@/lib/api/server';
import { SectionNav } from './section-nav';

/** Header of the public site: anchors to the sections, language, and the way into the portals. */
export async function SiteHeader({
  user,
  page = 'home',
}: {
  user: Awaited<ReturnType<typeof getCurrentUser>>;
  page?: 'home' | 'technology';
}) {
  const t = await getTranslations('landing.nav');
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-18 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" aria-label="Veris Assets">
          {/* About 10 % larger than before (2.75 and 3 rem). */}
          <Logo className="h-[3.025rem] sm:h-[3.3rem]" />
        </Link>
        <SectionNav page={page} />
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
