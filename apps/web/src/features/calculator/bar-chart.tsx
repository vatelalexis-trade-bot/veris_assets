import { parseDecimal } from '@virtus/shared';
import { cn } from '@/lib/utils';

export interface Bar {
  label: string;
  /** Exact decimal amount, never negative here. */
  value: string;
  /** Formatted amount shown next to the bar. */
  display: string;
  tone: 'muted' | 'primary' | 'accent';
}

const FILL = { muted: 'fill-muted/50', primary: 'fill-primary', accent: 'fill-accent' } as const;

/**
 * Horizontal bars scaled on the largest value, drawn in SVG from exact decimals. Each bar carries
 * its label and amount in text, so the chart reads without the picture.
 */
export function BarChart({ title, bars }: { title: string; bars: readonly Bar[] }) {
  const max = bars.reduce(
    (largest, bar) => (parseDecimal(bar.value).gt(largest) ? parseDecimal(bar.value) : largest),
    parseDecimal('0'),
  );
  const width = (value: string) =>
    max.isZero() ? '0%' : `${parseDecimal(value).dividedBy(max).times(100).toFixed(2)}%`;
  return (
    <figure className="flex flex-col gap-3">
      <figcaption className="text-sm font-medium">{title}</figcaption>
      <ul className="flex flex-col gap-3">
        {bars.map((bar) => (
          <li key={bar.label} className="flex flex-col gap-1">
            <div className="flex justify-between gap-3 text-xs">
              <span className="text-muted">{bar.label}</span>
              <span className="font-medium tabular-nums">{bar.display}</span>
            </div>
            <svg
              aria-hidden="true"
              className="h-2.5 w-full overflow-visible"
              preserveAspectRatio="none"
            >
              <rect width="100%" height="100%" rx="5" className="fill-surface-raised" />
              <rect width={width(bar.value)} height="100%" rx="5" className={cn(FILL[bar.tone])} />
            </svg>
          </li>
        ))}
      </ul>
    </figure>
  );
}
