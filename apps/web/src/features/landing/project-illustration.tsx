import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type ProjectKind =
  'solar' | 'wind' | 'storage' | 'residential' | 'logistics' | 'renovation' | 'charging';

/** Ground line and hills shared by every scene (viewBox 320 × 160). */
function Landscape() {
  return (
    <>
      <circle cx="262" cy="84" r="20" className="fill-accent/25" />
      <circle cx="262" cy="84" r="11" className="fill-accent/45" />
      <path d="M0 118 Q70 92 150 112 T320 104 V160 H0 Z" className="fill-border/60" />
      <path d="M0 132 Q90 116 190 128 T320 124 V160 H0 Z" className="fill-surface" />
    </>
  );
}

const SCENES: Record<ProjectKind, ReactNode> = {
  solar: (
    <>
      <Landscape />
      {[0, 1, 2].map((row) =>
        [0, 1, 2, 3, 4].map((column) => {
          const x = 34 + column * 50 - row * 10;
          const y = 104 + row * 16;
          return (
            <g key={`${row}-${column}`}>
              <polygon
                points={`${x},${y} ${x + 42},${y} ${x + 36},${y + 12} ${x - 6},${y + 12}`}
                className="fill-primary/80 stroke-accent/70"
                strokeWidth="1"
              />
              <line
                x1={x + 21}
                y1={y}
                x2={x + 15}
                y2={y + 12}
                className="stroke-accent/50"
                strokeWidth="0.75"
              />
            </g>
          );
        }),
      )}
    </>
  ),
  wind: (
    <>
      <Landscape />
      {(
        [
          [80, 56, 0.8],
          [170, 68, 0.66],
          [240, 76, 0.56],
        ] as const
      ).map(([x, top, scale]) => (
        <g key={x} transform={`translate(${x} ${top}) scale(${scale})`}>
          <path d="M-2 0 L-4 90 H4 L2 0 Z" className="fill-foreground/80" />
          <g className="origin-center [transform-box:fill-box] motion-safe:animate-[spin_14s_linear_infinite]">
            {/* Makes the box of the rotor square around the hub, so that it turns on the spot. */}
            <circle r="42" className="fill-none" />
            {[0, 120, 240].map((angle) => (
              <path
                key={angle}
                d="M0 0 C4 -10 3 -32 0 -42 C-2 -32 -3 -12 0 0 Z"
                transform={`rotate(${angle})`}
                className="fill-foreground/90"
              />
            ))}
          </g>
          <circle r="3.5" className="fill-accent" />
        </g>
      ))}
    </>
  ),
  storage: (
    <>
      <Landscape />
      <path
        d="M20 60 L60 50 L100 60 M60 50 V112 M230 58 L270 48 L310 58 M270 48 V112"
        className="stroke-muted/70"
        strokeWidth="1.5"
        fill="none"
      />
      <path d="M60 56 Q165 86 270 54" className="stroke-accent/60" strokeWidth="1" fill="none" />
      {[0, 1, 2].map((index) => (
        <g key={index} transform={`translate(${96 + index * 46} 94)`}>
          <rect width="40" height="30" rx="3" className="fill-surface-raised stroke-border" />
          <rect x="6" y="8" width="24" height="12" rx="2" className="fill-none stroke-accent" />
          <rect x="30" y="11" width="3" height="6" className="fill-accent" />
          <rect x="8" y="10" width={6 + index * 6} height="8" rx="1" className="fill-accent/80" />
        </g>
      ))}
    </>
  ),
  residential: (
    <>
      <Landscape />
      {(
        [
          [40, 74, 60, 52],
          [110, 62, 70, 66],
          [190, 78, 54, 48],
          [250, 70, 50, 58],
        ] as const
      ).map(([x, y, width, height]) => (
        <g key={x}>
          <rect
            x={x}
            y={y}
            width={width}
            height={height}
            rx="2"
            className="fill-surface-raised stroke-border"
          />
          {Array.from({ length: Math.floor((height - 12) / 14) }, (_, row) =>
            Array.from({ length: Math.floor((width - 8) / 14) }, (_, column) => (
              <rect
                key={`${row}-${column}`}
                x={x + 8 + column * 14}
                y={y + 8 + row * 14}
                width="7"
                height="8"
                rx="1"
                className={(row + column + x) % 3 === 0 ? 'fill-accent/80' : 'fill-primary/40'}
              />
            )),
          )}
        </g>
      ))}
      <circle cx="100" cy="118" r="9" className="fill-success/50" />
      <circle cx="244" cy="120" r="7" className="fill-success/50" />
    </>
  ),
  logistics: (
    <>
      <Landscape />
      <rect
        x="30"
        y="72"
        width="260"
        height="52"
        rx="2"
        className="fill-surface-raised stroke-border"
      />
      <rect x="26" y="66" width="268" height="8" rx="2" className="fill-border" />
      {[0, 1, 2, 3, 4, 5].map((index) => (
        <polygon
          key={index}
          points={`${40 + index * 42},66 ${72 + index * 42},66 ${68 + index * 42},58 ${44 + index * 42},58`}
          className="fill-primary/80 stroke-accent/60"
          strokeWidth="0.75"
        />
      ))}
      {[0, 1, 2, 3, 4].map((index) => (
        <rect
          key={index}
          x={56 + index * 46}
          y="96"
          width="30"
          height="28"
          rx="1"
          className="fill-background/70 stroke-border"
        />
      ))}
      <rect x="56" y="126" width="54" height="16" rx="2" className="fill-accent/70" />
      <rect x="112" y="130" width="16" height="12" rx="2" className="fill-accent/90" />
    </>
  ),
  renovation: (
    <>
      <Landscape />
      <g transform="translate(0 14)">
        <rect x="96" y="36" width="128" height="92" rx="2" className="fill-surface-raised" />
        <rect
          x="92"
          y="32"
          width="136"
          height="96"
          rx="4"
          className="fill-none stroke-accent"
          strokeWidth="2"
          strokeDasharray="6 4"
        />
        {[0, 1, 2, 3, 4].map((row) =>
          [0, 1, 2, 3, 4, 5].map((column) => (
            <rect
              key={`${row}-${column}`}
              x={106 + column * 19}
              y={44 + row * 16}
              width="10"
              height="10"
              rx="1"
              className={row === 0 ? 'fill-accent/80' : 'fill-primary/45'}
            />
          )),
        )}
        <polygon points="96,36 160,14 224,36" className="fill-primary/80" />
        <path d="M236 110 Q252 80 276 86 Q268 112 236 110 Z" className="fill-success/70" />
        <path d="M238 108 L266 90" className="stroke-background/70" strokeWidth="1.5" />
      </g>
    </>
  ),
  charging: (
    <>
      <Landscape />
      <path d="M20 128 H300" className="stroke-border" strokeWidth="2" />
      {[0, 1, 2, 3].map((index) => (
        <g key={index} transform={`translate(${52 + index * 62} 70)`}>
          <rect width="26" height="56" rx="4" className="fill-surface-raised stroke-border" />
          <rect x="5" y="7" width="16" height="12" rx="2" className="fill-accent/70" />
          <path d="M14 26 L9 36 H14 L12 46 L18 34 H13 Z" className="fill-accent" />
          <path
            d="M26 30 Q36 30 36 44 V56"
            className="stroke-muted/80"
            strokeWidth="2"
            fill="none"
          />
        </g>
      ))}
    </>
  ),
};

/**
 * Drawing of an illustrative project, built on the theme tokens: no photo to license, a few
 * hundred bytes each. Decorative: the name and description of the project are given in text.
 * Wide frames crop the top of the drawing, so the subject stays in its lower part (y ≥ 60).
 */
export function ProjectIllustration({
  kind,
  className,
}: {
  kind: ProjectKind;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 320 160"
      preserveAspectRatio="xMidYMax slice"
      className={cn('bg-surface-raised/60', className)}
    >
      <rect width="320" height="160" className="fill-background/40" />
      {SCENES[kind]}
    </svg>
  );
}
