import { Fingerprint, Languages, Link2, Users } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

const ITEMS = [
  ['ledger', Link2],
  ['fourEyes', Users],
  ['isolation', Fingerprint],
  ['bilingual', Languages],
] as const;

/** Four strengths of the platform, just below the first screen. */
export async function Highlights() {
  const t = await getTranslations('landing.strip');
  return (
    <section aria-label={t('label')} className="border-y border-border bg-surface/40">
      <ul className="mx-auto grid max-w-6xl gap-px px-6 sm:grid-cols-2 lg:grid-cols-4">
        {ITEMS.map(([key, Icon]) => (
          <li key={key} className="flex gap-4 py-8 lg:px-6 lg:first:pl-0">
            <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-accent" />
            <div className="flex flex-col gap-1">
              <p className="font-heading font-semibold">{t(`${key}.title`)}</p>
              <p className="text-sm text-muted">{t(`${key}.text`)}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
