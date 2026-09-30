'use client';

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface TabItem {
  value: string;
  label: ReactNode;
  content: ReactNode;
}

/**
 * Tabs following the WAI-ARIA pattern: arrow keys, Home and End move between the tabs, which are
 * activated as they receive focus. Every panel is in the page (for search engines and printing);
 * only the selected one is shown.
 */
export function Tabs({
  label,
  items,
  defaultValue,
  className,
}: {
  /** Accessible name of the list of tabs. */
  label: string;
  items: readonly TabItem[];
  defaultValue?: string;
  className?: string;
}) {
  const id = useId();
  const [selected, setSelected] = useState(defaultValue ?? items[0]?.value);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const last = items.length - 1;
    const target = {
      ArrowRight: index === last ? 0 : index + 1,
      ArrowLeft: index === 0 ? last : index - 1,
      Home: 0,
      End: last,
    }[event.key];
    if (target === undefined) return;
    event.preventDefault();
    setSelected(items[target]!.value);
    tabs.current[target]?.focus();
  };

  return (
    <div className={cn('flex flex-col gap-6', className)}>
      <div
        role="tablist"
        aria-label={label}
        className="flex w-fit max-w-full flex-wrap gap-1 rounded-xl border border-border bg-surface p-1"
      >
        {items.map((item, index) => {
          const active = item.value === selected;
          return (
            <button
              key={item.value}
              ref={(element) => {
                tabs.current[index] = element;
              }}
              type="button"
              role="tab"
              id={`${id}-tab-${item.value}`}
              aria-selected={active}
              aria-controls={`${id}-panel-${item.value}`}
              tabIndex={active ? 0 : -1}
              onClick={() => setSelected(item.value)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={cn(
                'rounded-lg px-3.5 py-2 text-sm font-medium whitespace-nowrap transition-colors sm:px-4',
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted hover:bg-surface-raised hover:text-foreground',
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {items.map((item) => (
        <div
          key={item.value}
          role="tabpanel"
          id={`${id}-panel-${item.value}`}
          aria-labelledby={`${id}-tab-${item.value}`}
          hidden={item.value !== selected}
        >
          {item.content}
        </div>
      ))}
    </div>
  );
}
