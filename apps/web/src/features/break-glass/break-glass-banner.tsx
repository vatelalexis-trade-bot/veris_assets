'use client';

import { ShieldAlert } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api/client';

/** Shown on every page while an emergency access is open (D-103), with the way to end it. */
export function BreakGlassBanner({
  tenantName,
  expiresAt,
}: {
  tenantName: string;
  expiresAt: string;
}) {
  const t = useTranslations('breakGlass');
  const format = useFormatter();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-center gap-3 border-b border-error-text/40 bg-surface px-4 py-2 text-sm text-error-text"
    >
      <ShieldAlert aria-hidden="true" className="size-4" />
      <span>
        {t('banner', {
          tenant: tenantName,
          time: format.dateTime(new Date(expiresAt), { timeStyle: 'short' }),
        })}
      </span>
      <Button
        size="sm"
        variant="secondary"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          await api.DELETE('/api/v1/break-glass');
          router.replace('/platform/break-glass');
          router.refresh();
        }}
      >
        {t('end')}
      </Button>
    </div>
  );
}
