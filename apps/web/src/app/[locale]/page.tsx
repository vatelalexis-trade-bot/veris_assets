import { ArrowRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { use } from 'react';
import { LanguageSwitcher } from '@/components/app/language-switcher';
import { Logo } from '@/components/app/logo';
import { Button } from '@/components/ui/button';
import { PORTALS, type PortalId } from '@/features/navigation/portals';
import { Link } from '@/i18n/navigation';

const PORTAL_ORDER: PortalId[] = ['issuer', 'investor', 'platform'];

/** Temporary home page: the landing page and its calculator arrive in phase 15 (D-019). */
export default function HomePage({ params }: PageProps<'/[locale]'>) {
  const { locale } = use(params);
  setRequestLocale(locale);
  const t = useTranslations();
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
          <p className="text-sm text-muted">{t('home.temporaryNavigation')}</p>
          <ul className="grid gap-4 md:grid-cols-3">
            {PORTAL_ORDER.map((portalId) => {
              const portal = PORTALS[portalId];
              return (
                <li
                  key={portalId}
                  className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5"
                >
                  <h3 className="font-semibold">{t(`portals.${portalId}`)}</h3>
                  <p className="flex-1 text-sm text-muted">
                    {t(`home.portalDescriptions.${portalId}`)}
                  </p>
                  <Button asChild variant="secondary" className="self-start">
                    <Link href={`${portal.path}/${portal.items[0]!.section}`}>
                      {t(`portals.${portalId}`)}
                      <ArrowRight aria-hidden="true" />
                    </Link>
                  </Button>
                </li>
              );
            })}
          </ul>
        </section>
      </main>
    </div>
  );
}
