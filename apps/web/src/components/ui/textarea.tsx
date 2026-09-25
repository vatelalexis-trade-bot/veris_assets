import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/** Multi-line text field, styled like Input. */
export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'min-h-20 w-full rounded-lg border border-input-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted aria-invalid:border-error-text disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}
