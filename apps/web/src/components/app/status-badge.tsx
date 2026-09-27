import {
  statusLabelKey,
  statusTone,
  type StatusDomain,
  type StatusOf,
  type StatusTone,
} from '@veris/shared';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

const TONE_CLASSES: Record<StatusTone, string> = {
  neutral: 'border-border text-muted',
  info: 'border-accent/40 text-accent',
  success: 'border-success/40 text-success',
  warning: 'border-warning/40 text-warning',
  error: 'border-error-text/40 text-error-text',
};

interface StatusBadgeProps<Domain extends StatusDomain> {
  domain: Domain;
  status: StatusOf<Domain>;
  className?: string;
}

/** Translated, coloured label of a business status (single mapping in @veris/shared). */
export function StatusBadge<Domain extends StatusDomain>({
  domain,
  status,
  className,
}: StatusBadgeProps<Domain>) {
  const t = useTranslations();
  return (
    <span
      data-tone={statusTone(domain, status)}
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
        TONE_CLASSES[statusTone(domain, status)],
        className,
      )}
    >
      {t(statusLabelKey(domain, status))}
    </span>
  );
}
