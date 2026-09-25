import { FlaskConical } from 'lucide-react';
import { useTranslations } from 'next-intl';

/** Permanent notice on every authenticated screen while the platform runs in sandbox (SPEC §3.3). */
export function DemoBanner() {
  const t = useTranslations('demoBanner');
  return (
    <div
      role="note"
      className="flex items-center justify-center gap-2 border-b border-warning/30 bg-surface px-4 py-1.5 text-xs font-medium text-warning"
    >
      <FlaskConical aria-hidden="true" className="size-3.5" />
      {t('text')}
    </div>
  );
}
