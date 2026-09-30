import {
  ArrowRight,
  Database,
  FileLock2,
  Fingerprint,
  History,
  KeyRound,
  ServerCog,
} from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { Section } from './section';
import { technologyPath } from './technology-path';

const ITEMS = [
  ['mfa', KeyRound],
  ['isolation', Fingerprint],
  ['ledger', Database],
  ['audit', History],
  ['documents', FileLock2],
  ['hosting', ServerCog],
] as const;

/**
 * Security by design (SPEC §24). Wording allowed by SPEC §19.1: no claim of compliance or
 * certification, only what the architecture does. The technology page tells more.
 */
export async function Security() {
  const t = await getTranslations('landing.security');
  return (
    <Section id="security" eyebrow={t('eyebrow')} title={t('title')} subtitle={t('subtitle')}>
      <ul className="grid gap-x-10 gap-y-10 md:grid-cols-2 lg:grid-cols-3">
        {ITEMS.map(([key, Icon]) => (
          <li key={key} className="flex gap-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-surface text-accent">
              <Icon aria-hidden="true" className="size-5" />
            </span>
            <div className="flex flex-col gap-1.5">
              <h3 className="font-semibold">{t(`${key}.title`)}</h3>
              <p className="text-sm text-muted">{t(`${key}.text`)}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className="rounded-2xl border border-border bg-surface px-6 py-5 text-sm text-muted">
        {t('note')}
      </p>
      <Button asChild variant="secondary" className="h-11 w-fit px-5">
        <Link href={technologyPath(await getLocale())}>
          {t('learnMore')}
          <ArrowRight aria-hidden="true" />
        </Link>
      </Button>
    </Section>
  );
}
