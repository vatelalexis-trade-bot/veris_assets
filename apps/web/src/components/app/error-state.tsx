import { isErrorCode, type ErrorCode } from '@virtus/shared';
import { TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

interface ErrorStateProps {
  /** Code of the API error (SPEC §22.2); unknown codes are shown as INTERNAL_ERROR. */
  code: string;
  /** Correlation ID of the failed request, shown so that support can find it in the logs. */
  correlationId?: string;
  action?: ReactNode;
}

/** Understandable error message translated from the stable error code (SPEC §22.2, §23.3). */
export function ErrorState({ code, correlationId, action }: ErrorStateProps) {
  const t = useTranslations();
  const knownCode: ErrorCode = isErrorCode(code) ? code : 'INTERNAL_ERROR';
  return (
    <div
      role="alert"
      className="flex flex-col gap-2 rounded-xl border border-error-text/40 bg-surface p-4"
    >
      <div className="flex items-center gap-2 font-semibold text-error-text">
        <TriangleAlert aria-hidden="true" className="size-5" />
        {t('errorState.title')}
      </div>
      <p className="text-sm text-foreground">{t(`errors.${knownCode}`)}</p>
      {correlationId ? (
        <p className="font-mono text-xs text-muted">
          {t('errorState.correlationId', { id: correlationId })}
        </p>
      ) : null}
      {action}
    </div>
  );
}
