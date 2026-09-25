import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/** Native select: accessible and keyboard-friendly by default. */
export function Select({ className, ...props }: ComponentProps<'select'>) {
  return (
    <select
      data-slot="select"
      className={cn(
        'h-9 w-full rounded-lg border border-input-border bg-surface px-3 text-sm text-foreground aria-invalid:border-error-text disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}
