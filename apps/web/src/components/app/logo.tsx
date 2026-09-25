import Image from 'next/image';
import { cn } from '@/lib/utils';

/**
 * Official logo file (brand/, SPEC §2.4), shown without distortion or recolouring. The frame only
 * shows the central part of the image, whose wide margins have the same colour as the page
 * background. To be replaced by the SVG version when available.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn('relative h-16 w-44 overflow-hidden bg-background', className)}>
      <Image
        src="/brand/virtus-assets-logo.jpg"
        alt="Virtus Assets"
        fill
        sizes="176px"
        priority
        className="object-cover object-center"
      />
    </div>
  );
}
