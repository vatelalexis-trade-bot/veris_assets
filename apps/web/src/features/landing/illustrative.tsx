import { FlaskConical, Info } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

/**
 * Visible on every fictitious project, amount or yield of the public site: none of them is a real
 * client or a real offer (brief of the landing page, SPEC §3.3).
 */
export function IllustrativeBadge({ className }: { className?: string }) {
  const t = useTranslations('landing.illustrative');
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-warning/60 bg-background/90 px-2.5 py-0.5 text-[11px] font-semibold tracking-wide text-warning uppercase',
        className,
      )}
    >
      <FlaskConical aria-hidden="true" className="size-3" />
      {t('badge')}
    </span>
  );
}

/** Goes with every yield shown: illustrative, not guaranteed, with the risks of private assets. */
export function YieldNotice({ className }: { className?: string }) {
  const t = useTranslations('landing.illustrative');
  return (
    <p className={cn('flex gap-2 text-xs text-muted', className)}>
      <Info aria-hidden="true" className="mt-px size-3.5 shrink-0" />
      {t('yieldNotice')}
    </p>
  );
}
