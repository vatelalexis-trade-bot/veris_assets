'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { technologyPath } from './technology-path';

export const NAV_SECTIONS = [
  'solution',
  'security',
  'projects',
  'lifecycle',
  'calculator',
  'contact',
] as const;
type NavSection = (typeof NAV_SECTIONS)[number];

/**
 * A section is "shown" when it crosses a thin band at a third of the window's height: only one
 * section can cross it at a time. A section without a menu entry (e.g. "roles") keeps the last one.
 */
const BAND = '-33% 0px -66% 0px';
/** After a click, the scroll passes over other sections: they must not take the highlight. */
const CLICK_LOCK_MS = 1000;

const LINK =
  'inline-flex flex-col items-center transition-colors hover:text-foreground after:invisible after:h-0 after:overflow-hidden after:font-semibold after:content-[attr(data-label)]';
const HIGHLIGHTED = 'font-semibold text-accent hover:text-accent';

/**
 * Menu of the public site. On the home page, anchors to its sections, the one on screen being
 * highlighted (scroll-spy); on the technology page, the same entries lead back to the home page.
 */
export function SectionNav({ page = 'home' }: { page?: 'home' | 'technology' }) {
  const t = useTranslations('landing.nav');
  const locale = useLocale();
  const [active, setActive] = useState<NavSection | null>(null);
  const lockedUntil = useRef(0);

  useEffect(() => {
    if (page !== 'home') return;
    const elements = NAV_SECTIONS.map((id) => document.getElementById(id)).filter(
      (element): element is HTMLElement => element !== null,
    );
    if (elements.length === 0 || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (Date.now() < lockedUntil.current) return;
        const shown = entries.find((entry) => entry.isIntersecting);
        if (shown) setActive(shown.target.id as NavSection);
      },
      { rootMargin: BAND },
    );
    for (const element of elements) observer.observe(element);
    return () => observer.disconnect();
  }, [page]);

  return (
    <nav aria-label={t('label')} className="hidden items-center gap-5 text-sm lg:flex xl:gap-7">
      {NAV_SECTIONS.map((section) =>
        page === 'home' ? (
          <a
            key={section}
            href={`#${section}`}
            // The bold label is laid out invisibly too, so that highlighting never shifts the menu.
            data-label={t(section)}
            aria-current={active === section ? 'true' : undefined}
            onClick={() => {
              lockedUntil.current = Date.now() + CLICK_LOCK_MS;
              setActive(section);
            }}
            className={cn(LINK, active === section ? HIGHLIGHTED : 'text-muted')}
          >
            {t(section)}
          </a>
        ) : (
          <Link
            key={section}
            href={{ pathname: '/', hash: section }}
            data-label={t(section)}
            className={cn(LINK, 'text-muted')}
          >
            {t(section)}
          </Link>
        ),
      )}
      <Link
        href={technologyPath(locale)}
        data-label={t('technology')}
        aria-current={page === 'technology' ? 'page' : undefined}
        className={cn(LINK, page === 'technology' ? HIGHLIGHTED : 'text-muted')}
      >
        {t('technology')}
      </Link>
    </nav>
  );
}
