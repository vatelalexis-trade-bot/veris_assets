'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';

/**
 * Horizontal carousel without a library: the browser scrolls (swipe, trackpad, arrow keys once
 * the list has the focus), cards snap into place, and two buttons move by one card. Smooth
 * scrolling is dropped when the visitor asks for reduced motion. The children are `<li>` items
 * with the `snap-start shrink-0` classes and their width.
 */
export function Carousel({ label, children }: { label: string; children: ReactNode }) {
  const t = useTranslations('landing.projects');
  const track = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });

  const measure = useCallback(() => {
    const element = track.current;
    if (!element) return;
    setEdges({
      start: element.scrollLeft <= 1,
      end: element.scrollLeft + element.clientWidth >= element.scrollWidth - 1,
    });
  }, []);

  useEffect(() => {
    const element = track.current;
    if (!element) return;
    measure();
    // A hidden tab has no width: it is measured again when it is shown.
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [measure]);

  const move = (direction: 1 | -1) => {
    const element = track.current;
    const card = element?.firstElementChild as HTMLElement | null;
    if (!element || !card) return;
    const gap = parseFloat(getComputedStyle(element).columnGap) || 0;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    element.scrollBy({
      left: direction * (card.offsetWidth + gap),
      behavior: reduced ? 'auto' : 'smooth',
    });
  };

  return (
    <div role="region" aria-roledescription={t('carousel')} aria-label={label}>
      <ul
        ref={track}
        onScroll={measure}
        tabIndex={0}
        aria-label={label}
        className="-mx-1 flex snap-x snap-mandatory gap-4 overflow-x-auto px-1 pb-2 [scrollbar-width:thin]"
      >
        {children}
      </ul>
      {edges.start && edges.end ? null : (
        <div className="mt-4 flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            size="icon"
            onClick={() => move(-1)}
            disabled={edges.start}
            aria-label={t('previous')}
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            onClick={() => move(1)}
            disabled={edges.end}
            aria-label={t('next')}
          >
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
      )}
    </div>
  );
}
