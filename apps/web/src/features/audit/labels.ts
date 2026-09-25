'use client';

import { useTranslations } from 'next-intl';

/** Label of an audit action; an action without translation is shown as its code. */
export function useActionLabel() {
  const t = useTranslations('audit.actions');
  return (action: string) => (t.has(action) ? t(action) : action);
}
