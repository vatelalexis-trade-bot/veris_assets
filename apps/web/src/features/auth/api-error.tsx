'use client';

import { useTranslations } from 'next-intl';
import { ErrorState } from '@/components/app/error-state';
import { correlationIdOf, errorCodeOf, errorDetailCodesOf } from '@/lib/api/client';

/** Error of an API call, with the refused password rules when there are some. */
export function ApiError({ error }: { error: unknown }) {
  const t = useTranslations();
  const code = errorCodeOf(error);
  const passwordRules = errorDetailCodesOf(error).filter((detail) =>
    detail.startsWith('PASSWORD_'),
  );
  const expected = ['INVALID_CREDENTIALS', 'MFA_INVALID_CODE', 'PASSWORD_TOO_WEAK'].includes(code);
  return (
    <ErrorState
      code={code}
      correlationId={expected ? undefined : correlationIdOf(error)}
      action={
        passwordRules.length > 0 ? (
          <ul className="list-inside list-disc text-sm text-foreground">
            {passwordRules.map((rule) => (
              <li key={rule}>{t(`passwordRules.${rule}`)}</li>
            ))}
          </ul>
        ) : undefined
      }
    />
  );
}
