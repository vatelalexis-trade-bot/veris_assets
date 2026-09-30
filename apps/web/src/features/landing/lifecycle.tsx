import {
  BadgeCheck,
  ClipboardCheck,
  FileSearch,
  FileStack,
  HandCoins,
  LayoutDashboard,
  Layers,
  ScrollText,
  Signature,
  UserCheck,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Tabs } from '@/components/ui/tabs';
import { Section } from './section';

/** The investor's journey, from the issuer's invitation to the follow-up of the positions. */
const INVESTOR_STEPS = [
  ['invitation', UserPlus],
  ['status', BadgeCheck],
  ['documents', FileSearch],
  ['signature', Signature],
  ['follow', LayoutDashboard],
] as const;

/** The six steps of the life of an issuance, on the issuer's side (SPEC §1). */
const ISSUER_STEPS = [
  ['structure', FileStack],
  ['onboard', UserCheck],
  ['subscribe', ClipboardCheck],
  ['allocate', Layers],
  ['register', ScrollText],
  ['service', HandCoins],
] as const;

function Steps({
  steps,
  text,
  columns,
}: {
  steps: readonly (readonly [string, LucideIcon])[];
  text: (key: string, part: 'title' | 'text') => string;
  columns: string;
}) {
  return (
    <ol className={`grid gap-4 md:grid-cols-2 ${columns}`}>
      {steps.map(([key, Icon], index) => (
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
          <h3 className="font-semibold">{text(key, 'title')}</h3>
          <p className="text-sm text-muted">{text(key, 'text')}</p>
        </li>
      ))}
    </ol>
  );
}

/** The two journeys of an issuance: the investor's and the issuer's (or asset manager's). */
export async function Lifecycle() {
  const t = await getTranslations('landing.lifecycle');
  return (
    <Section id="lifecycle" eyebrow={t('eyebrow')} title={t('title')} subtitle={t('subtitle')}>
      <Tabs
        label={t('journeys')}
        items={[
          {
            value: 'investor',
            label: t('investor.tab'),
            content: (
              <div className="flex flex-col gap-5">
                <p className="text-pretty text-muted">{t('investor.lead')}</p>
                <Steps
                  steps={INVESTOR_STEPS}
                  text={(key, part) => t(`investor.${key}.${part}`)}
                  columns="lg:grid-cols-3 xl:grid-cols-5"
                />
              </div>
            ),
          },
          {
            value: 'issuer',
            label: t('issuer.tab'),
            content: (
              <div className="flex flex-col gap-5">
                <p className="text-pretty text-muted">{t('issuer.lead')}</p>
                <Steps
                  steps={ISSUER_STEPS}
                  text={(key, part) => t(`${key}.${part}`)}
                  columns="lg:grid-cols-3"
                />
              </div>
            ),
          },
        ]}
      />
    </Section>
  );
}
