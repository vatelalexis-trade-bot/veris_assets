import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** A section of the public site: an anchor, a small eyebrow, a title and a lead paragraph. */
export function Section({
  id,
  eyebrow,
  title,
  subtitle,
  children,
  className,
}: {
  id: string;
  eyebrow: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={cn('scroll-mt-24 py-20 md:py-28', className)}
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-12 px-6">
        <div className="flex max-w-3xl flex-col gap-4">
          <p className="flex items-center gap-3 text-sm font-semibold tracking-widest text-accent uppercase">
            <span aria-hidden="true" className="bg-brand-gradient h-px w-8" />
            {eyebrow}
          </p>
          <h2
            id={`${id}-title`}
            className="text-3xl font-semibold tracking-tight text-balance md:text-4xl"
          >
            {title}
          </h2>
          {subtitle ? <p className="text-lg text-pretty text-muted">{subtitle}</p> : null}
        </div>
        {children}
      </div>
    </section>
  );
}
