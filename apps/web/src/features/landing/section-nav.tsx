'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export const NAV_SECTIONS = ['platform', 'lifecycle', 'security', 'calculator', 'contact'] as const;
type NavSection = (typeof NAV_SECTIONS)[number];

/**
 * A section is "shown" when it crosses a thin band at a third of the window's height: only one
 * section can cross it at a time. A section without a menu entry (e.g. "roles") keeps the last one.
 */
const BAND = '-33% 0px -66% 0px';
/** After a click, the scroll passes over other sections: they must not take the highlight. */
const CLICK_LOCK_MS = 1000;

/** Anchors to the sections of the public site; the one on screen is highlighted (scroll-spy). */
export function SectionNav() {
  const t = useTranslations('landing.nav');
  const [active, setActive] = useState<NavSection | null>(null);
  const lockedUntil = useRef(0);

  useEffect(() => {
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
  }, []);

  return (
    <nav aria-label={t('label')} className="hidden items-center gap-7 text-sm lg:flex">
      {NAV_SECTIONS.map((section) => (
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
          className={cn(
            'inline-flex flex-col items-center transition-colors hover:text-foreground',
            'after:invisible after:h-0 after:overflow-hidden after:font-semibold after:content-[attr(data-label)]',
            active === section ? 'font-semibold text-accent hover:text-accent' : 'text-muted',
          )}
        >
          {t(section)}
        </a>
      ))}
    </nav>
  );
}
