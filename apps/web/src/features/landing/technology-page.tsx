import {
  ArrowDown,
  ArrowRight,
  Binary,
  Check,
  Cpu,
  Database,
  Eye,
  Fingerprint,
  Globe,
  History,
  KeyRound,
  Link2,
  LogIn,
  Repeat,
  Server,
  ShieldCheck,
  Sigma,
  TestTubes,
} from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { getCurrentUser } from '@/lib/api/server';
import { Section } from './section';
import { SiteFooter } from './site-footer';
import { SiteHeader } from './site-header';

const LAYERS = [
  ['browser', Globe],
  ['web', Server],
  ['api', Cpu],
  ['database', Database],
] as const;

const RELIABILITY = [
  ['fourEyes', Eye],
  ['audit', History],
  ['exact', Sigma],
  ['idempotent', Repeat],
  ['tests', TestTubes],
  ['access', KeyRound],
] as const;

/** Illustration of the hash chain: three movements, each sealed with the previous fingerprint. */
const CHAIN = [
  ['1', 'ISSUANCE', '1 000', '9f3c…a41e'],
  ['2', 'ALLOCATION', '100', '4b7d…0c92'],
  ['3', 'UNBLOCK', '100', 'e21a…7f58'],
] as const;

function Points({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-col gap-3 text-sm">
      {items.map((item) => (
        <li key={item} className="flex gap-3">
          <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-accent" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function TwoColumns({ text, aside }: { text: ReactNode; aside: ReactNode }) {
  return (
    <div className="grid items-start gap-10 lg:grid-cols-[1.1fr_1fr]">
      <div className="flex flex-col gap-5 text-pretty text-muted">{text}</div>
      {aside}
    </div>
  );
}

/**
 * Technology page of the public site (/en/technology, /fr/technologie): the architecture behind
 * the Security section of the home page, and why the registry can be trusted. States facts of
 * the implementation only; no claim of regulatory approval (SPEC §19.1, §31.2 rule 1).
 */
export async function TechnologyPage() {
  const [t, user] = await Promise.all([getTranslations('technology'), getCurrentUser()]);
  return (
    <>
      <SiteHeader user={user} page="technology" />
      <main>
        <section aria-labelledby="technology-title" className="relative isolate overflow-hidden">
          <div aria-hidden="true" className="bg-grid absolute inset-0 -z-10" />
          <div
            aria-hidden="true"
            className="bg-glow-primary absolute -top-40 left-1/2 -z-10 size-[48rem] -translate-x-1/2"
          />
          <div className="mx-auto flex max-w-6xl flex-col gap-7 px-6 pt-20 pb-16 md:pt-28">
            <p className="flex items-center gap-3 text-sm font-semibold tracking-widest text-accent uppercase">
              <span aria-hidden="true" className="bg-brand-gradient h-px w-8" />
              {t('eyebrow')}
            </p>
            <h1
              id="technology-title"
              className="max-w-4xl text-4xl leading-[1.1] font-semibold tracking-tight text-balance md:text-5xl"
            >
              {t('title')}
            </h1>
            <p className="max-w-3xl text-lg text-pretty text-muted">{t('subtitle')}</p>
            <div className="flex flex-wrap gap-3">
              <Button asChild className="h-11 px-5">
                <Link href="/login">
                  <LogIn aria-hidden="true" />
                  {t('cta.demo')}
                </Link>
              </Button>
              <Button asChild variant="secondary" className="h-11 px-5">
                <Link href={{ pathname: '/', hash: 'contact' }}>
                  {t('cta.contact')}
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </div>
        </section>

        <Section
          id="overview"
          eyebrow={t('overview.eyebrow')}
          title={t('overview.title')}
          subtitle={t('overview.subtitle')}
          className="bg-surface/30"
        >
          <ol className="grid gap-4 lg:grid-cols-4">
            {LAYERS.map(([key, Icon], index) => (
              <li key={key} className="relative flex flex-col gap-3">
                <div className="flex h-full flex-col gap-3 rounded-2xl border border-border bg-background p-6">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-surface-raised text-accent">
                    <Icon aria-hidden="true" className="size-5" />
                  </span>
                  <h3 className="font-semibold">{t(`overview.${key}.title`)}</h3>
                  <p className="text-sm text-muted">{t(`overview.${key}.text`)}</p>
                </div>
                {index < LAYERS.length - 1 ? (
                  <>
                    <ArrowRight
                      aria-hidden="true"
                      className="absolute top-1/2 -right-3.5 z-10 hidden size-5 -translate-y-1/2 text-accent lg:block"
                    />
                    <ArrowDown
                      aria-hidden="true"
                      className="mx-auto size-5 text-accent lg:hidden"
                    />
                  </>
                ) : null}
              </li>
            ))}
          </ol>
        </Section>

        <Section id="ledger" eyebrow={t('ledger.eyebrow')} title={t('ledger.title')}>
          <TwoColumns
            text={
              <>
                <p>{t('ledger.p1')}</p>
                <p>{t('ledger.p2')}</p>
              </>
            }
            aside={
              <div className="rounded-2xl border border-border bg-surface p-6">
                <Points
                  items={[t('ledger.points.p1'), t('ledger.points.p2'), t('ledger.points.p3')]}
                />
              </div>
            }
          />
        </Section>

        <Section
          id="hash"
          eyebrow={t('hash.eyebrow')}
          title={t('hash.title')}
          className="bg-surface/30"
        >
          <TwoColumns
            text={
              <>
                <p>{t('hash.p1')}</p>
                <p>{t('hash.p2')}</p>
                <p className="rounded-xl border border-border bg-background px-4 py-3 font-mono text-sm text-accent">
                  {t('hash.example')}
                </p>
              </>
            }
            aside={
              <ol aria-hidden="true" className="flex flex-col items-stretch">
                {CHAIN.map(([sequence, type, units, fingerprint], index) => (
                  <li key={sequence} className="flex flex-col items-center">
                    {index > 0 ? <Link2 className="my-1 size-5 rotate-90 text-accent" /> : null}
                    <div className="w-full rounded-xl border border-border bg-background p-4 font-mono text-xs">
                      <div className="flex justify-between text-muted">
                        <span>#{sequence}</span>
                        <span>{type}</span>
                        <span>{units}</span>
                      </div>
                      <div className="mt-2 flex items-center gap-2 text-accent">
                        <Fingerprint className="size-4" />
                        SHA-256 {fingerprint}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            }
          />
        </Section>

        <Section id="isolation" eyebrow={t('isolation.eyebrow')} title={t('isolation.title')}>
          <TwoColumns
            text={
              <>
                <p>{t('isolation.p1')}</p>
                <p>{t('isolation.p2')}</p>
              </>
            }
            aside={
              <div className="rounded-2xl border border-border bg-surface p-6">
                <Points
                  items={[
                    t('isolation.points.p1'),
                    t('isolation.points.p2'),
                    t('isolation.points.p3'),
                  ]}
                />
              </div>
            }
          />
        </Section>

        <Section
          id="hosting"
          eyebrow={t('hosting.eyebrow')}
          title={t('hosting.title')}
          className="bg-surface/30"
        >
          <div className="grid gap-6 md:grid-cols-2">
            {(['p1', 'p2'] as const).map((key, index) => (
              <div
                key={key}
                className="flex gap-4 rounded-2xl border border-border bg-background p-6"
              >
                {index === 0 ? (
                  <Globe aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-accent" />
                ) : (
                  <Binary aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-accent" />
                )}
                <p className="text-sm text-muted">{t(`hosting.${key}`)}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section id="reliability" eyebrow={t('reliability.eyebrow')} title={t('reliability.title')}>
          <ul className="grid gap-x-10 gap-y-10 md:grid-cols-2 lg:grid-cols-3">
            {RELIABILITY.map(([key, Icon]) => (
              <li key={key} className="flex gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-surface text-accent">
                  <Icon aria-hidden="true" className="size-5" />
                </span>
                <div className="flex flex-col gap-1.5">
                  <h3 className="font-semibold">{t(`reliability.${key}.title`)}</h3>
                  <p className="text-sm text-muted">{t(`reliability.${key}.text`)}</p>
                </div>
              </li>
            ))}
          </ul>
          <aside className="flex gap-4 rounded-2xl border border-border bg-surface px-6 py-5">
            <ShieldCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-warning" />
            <div className="flex flex-col gap-1.5">
              <h3 className="font-semibold">{t('scope.title')}</h3>
              <p className="text-sm text-muted">{t('scope.text')}</p>
            </div>
          </aside>
        </Section>
      </main>
      <SiteFooter />
    </>
  );
}
