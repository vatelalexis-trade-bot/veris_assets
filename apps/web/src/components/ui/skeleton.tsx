import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/** Placeholder shown while content is loading (SPEC §23.3: progressive loading states). */
export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn('animate-pulse rounded-md bg-surface-raised', className)}
      {...props}
    />
  );
}
