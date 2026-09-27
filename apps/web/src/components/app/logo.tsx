import Image from 'next/image';
import { cn } from '@/lib/utils';

/**
 * Official logo (SPEC §2.4), vector version on a transparent background (D-098), never distorted
 * or recoloured: the height is set by the caller, the width follows the proportions.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <Image
      src="/brand/veris-assets-logo.svg"
      alt="Veris Assets"
      width={736}
      height={441}
      priority
      unoptimized
      className={cn('h-12 w-auto', className)}
    />
  );
}
