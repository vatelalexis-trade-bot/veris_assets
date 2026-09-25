import { ArrowRight, LogIn } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { LanguageSwitcher } from '@/components/app/language-switcher';
import { Logo } from '@/components/app/logo';
import { Button } from '@/components/ui/button';
import { PORTAL_PATHS } from '@/features/auth/destination';
import { type PortalId } from '@/features/navigation/portals';
import { Link } from '@/i18n/navigation';
import { getCurrentUser } from '@/lib/api/server';

const PORTAL_ORDER: PortalId[] = ['issuer', 'investor', 'platform'];

/** Temporary home page: the landing page and its calculator arrive in phase 15 (D-019). */
export default async function HomePage({ params }: PageProps<'/[locale]'>) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const user = await getCurrentUser();
  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-10 px-6 py-8">
      <header className="flex items-center justify-between">
        <Logo />
        <LanguageSwitcher />
      </header>
      <main className="flex flex-col gap-8">
        <div className="flex flex-col gap-3">
          <h1 className="text-3xl font-semibold md:text-4xl">{t('home.title')}</h1>
          <p className="max-w-2xl text-lg text-muted">{t('home.subtitle')}</p>
          <p
            role="note"
            className="max-w-2xl rounded-lg border border-warning/30 bg-surface px-4 py-3 text-sm text-warning"
          >
            {t('home.demoNotice')}
          </p>
        </div>
        <section aria-labelledby="portals-title" className="flex flex-col gap-4">
          <h2 id="portals-title" className="text-xl font-semibold">
            {t('home.choosePortal')}
          </h2>
          <div>
            <Button asChild>
              {user ? (
                <Link href={PORTAL_PATHS[user.homePortal]}>
                  {t('home.openPortal')}
                  <ArrowRight aria-hidden="true" />
                </Link>
              ) : (
                <Link href="/login">
                  <LogIn aria-hidden="true" />
                  {t('home.signIn')}
                </Link>
              )}
            </Button>
          </div>
          <ul className="grid gap-4 md:grid-cols-3">
            {PORTAL_ORDER.map((portalId) => (
              <li
                key={portalId}
                className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-5"
              >
                <h3 className="font-semibold">{t(`portals.${portalId}`)}</h3>
                <p className="text-sm text-muted">{t(`home.portalDescriptions.${portalId}`)}</p>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
