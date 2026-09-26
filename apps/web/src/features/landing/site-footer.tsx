import { getTranslations } from 'next-intl/server';
import { Logo } from '@/components/app/logo';
import { Link } from '@/i18n/navigation';

/** Footer: what the platform is, the demonstration notice (SPEC §3.3) and the main links. */
export async function SiteFooter() {
  const t = await getTranslations('landing');
  return (
    <footer className="border-t border-border bg-surface/40">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-12 md:flex-row md:items-start md:justify-between">
        <div className="flex max-w-sm flex-col gap-3">
          <Logo className="h-14 w-40" />
          <p className="text-sm text-muted">{t('footer.tagline')}</p>
        </div>
        <nav aria-label={t('nav.label')} className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {(['lifecycle', 'security', 'calculator', 'contact'] as const).map((section) => (
            <a key={section} href={`#${section}`} className="text-muted hover:text-foreground">
              {t(`nav.${section}`)}
            </a>
          ))}
          <Link href="/login" className="text-muted hover:text-foreground">
            {t('nav.signIn')}
          </Link>
        </nav>
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-5 text-xs text-muted md:flex-row md:justify-between">
          <p>{t('footer.demo')}</p>
          <p>{t('footer.rights', { year: new Date().getUTCFullYear() })}</p>
        </div>
      </div>
    </footer>
  );
}
