import Image from 'next/image';
import { cn } from '@/lib/utils';

/**
 * Photo of an illustrative project, stored in `public/images/projects/` as a 1200 × 600 WebP
 * (2:1). AI-generated images of fictitious projects (D-110): every place that shows one also
 * shows the "Illustrative example" badge. Next.js serves a size matched to `sizes`.
 */
export function ProjectPhoto({
  src,
  alt,
  sizes,
  preload = false,
  className,
}: {
  src: string;
  alt: string;
  /** Width the photo takes on screen, for the browser to pick a file (see `next/image`). */
  sizes: string;
  /** Only for the photo of the first screen, which is part of the largest paint. */
  preload?: boolean;
  className?: string;
}) {
  return (
    <Image
      src={src}
      alt={alt}
      width={1200}
      height={600}
      sizes={sizes}
      preload={preload}
      loading={preload ? undefined : 'lazy'}
      className={cn('bg-surface-raised object-cover', className)}
    />
  );
}
