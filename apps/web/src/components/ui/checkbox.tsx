import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/** Native checkbox, coloured with the accent token. */
export function Checkbox({ className, ...props }: Omit<ComponentProps<'input'>, 'type'>) {
  return (
    <input
      type="checkbox"
      data-slot="checkbox"
      className={cn('size-4 accent-accent', className)}
      {...props}
    />
  );
}
