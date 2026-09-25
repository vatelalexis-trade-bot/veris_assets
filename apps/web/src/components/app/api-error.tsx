'use client';

import { useTranslations } from 'next-intl';
import { ErrorState } from '@/components/app/error-state';
import { correlationIdOf, errorCodeOf, errorDetailCodesOf } from '@/lib/api/client';

/** Errors the user can fix alone: no support reference is shown for them. */
const USER_ERRORS = [
  'INVALID_CREDENTIALS',
  'MFA_INVALID_CODE',
  'PASSWORD_TOO_WEAK',
  'VALIDATION_FAILED',
];

/** Error of an API call, with the refused password rules or validation reasons when there are some. */
export function ApiError({ error }: { error: unknown }) {
  const t = useTranslations();
  const code = errorCodeOf(error);
  // Password rules and known validation reasons are explained in plain language.
  const reasons = errorDetailCodesOf(error).flatMap((detail) => {
    if (detail.startsWith('PASSWORD_')) return [t(`passwordRules.${detail}`)];
    if (t.has(`validationDetails.${detail}`)) return [t(`validationDetails.${detail}`)];
    return [];
  });
  return (
    <ErrorState
      code={code}
      correlationId={USER_ERRORS.includes(code) ? undefined : correlationIdOf(error)}
      action={
        reasons.length > 0 ? (
          <ul className="list-inside list-disc text-sm text-foreground">
            {reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        ) : undefined
      }
    />
  );
}
