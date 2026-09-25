import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return (
    <input
      data-slot="input"
      className={cn(
        'h-9 w-full rounded-lg border border-input-border bg-surface px-3 text-sm text-foreground placeholder:text-muted aria-invalid:border-error-text disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}
