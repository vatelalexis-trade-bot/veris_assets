import { ClipboardCheck, FileStack, HandCoins, Layers, ScrollText, UserCheck } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Section } from './section';

const STEPS = [
  ['structure', FileStack],
  ['onboard', UserCheck],
  ['subscribe', ClipboardCheck],
  ['allocate', Layers],
  ['register', ScrollText],
  ['service', HandCoins],
] as const;

/** The six steps of the life of an issuance (SPEC §1). */
export async function Lifecycle() {
  const t = await getTranslations('landing.lifecycle');
  return (
    <Section id="lifecycle" eyebrow={t('eyebrow')} title={t('title')} subtitle={t('subtitle')}>
      <ol className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {STEPS.map(([key, Icon], index) => (
          <li
            key={key}
            className="group relative flex flex-col gap-4 overflow-hidden rounded-2xl border border-border bg-surface p-6 transition-colors hover:border-primary/60"
          >
            <span
              aria-hidden="true"
              className="bg-brand-gradient absolute inset-x-0 top-0 h-px opacity-0 transition-opacity group-hover:opacity-100"
            />
            <div className="flex items-center justify-between">
              <span className="flex size-10 items-center justify-center rounded-xl bg-surface-raised text-accent">
                <Icon aria-hidden="true" className="size-5" />
              </span>
              <span
                aria-hidden="true"
                className="font-heading text-sm font-semibold text-muted tabular-nums"
              >
                {String(index + 1).padStart(2, '0')}
              </span>
            </div>
            <h3 className="text-lg font-semibold">{t(`${key}.title`)}</h3>
            <p className="text-sm text-muted">{t(`${key}.text`)}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}
