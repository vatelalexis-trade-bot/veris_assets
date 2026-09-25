'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { cn } from '@/lib/utils';

const SHORT_NAMES = { 'en-GB': 'EN', 'fr-FR': 'FR' } as const;

/** Switches language while staying on the same page (SPEC §23.4). */
export function LanguageSwitcher() {
  const t = useTranslations();
  const currentLocale = useLocale();
  const pathname = usePathname();
  return (
    <nav aria-label={t('common.language')} className="flex items-center gap-1 text-sm">
      {routing.locales.map((locale) => (
        <Link
          key={locale}
          href={pathname}
          locale={locale}
          lang={locale}
          hrefLang={locale}
          aria-label={t(`languages.${locale}`)}
          aria-current={locale === currentLocale ? 'true' : undefined}
          className={cn(
            'rounded-md px-2 py-1 font-medium',
            locale === currentLocale
              ? 'bg-surface-raised text-foreground'
              : 'text-muted hover:text-foreground',
          )}
        >
          {SHORT_NAMES[locale]}
        </Link>
      ))}
    </nav>
  );
}
