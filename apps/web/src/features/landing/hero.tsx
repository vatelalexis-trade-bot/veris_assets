import {
  BadgeCheck,
  Briefcase,
  FlaskConical,
  Link2,
  MessagesSquare,
  PlayCircle,
} from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { IllustrativeBadge, YieldNotice } from './illustrative';
import { ProjectPhoto } from './project-photo';

/**
 * First screen: what Veris Assets does in one sentence, the demo and the team as ways in, and an
 * illustrative issuance as seen in the product. Professional investors only (SPEC §4).
 */
export async function Hero() {
  const t = await getTranslations('landing');
  return (
    <section aria-labelledby="hero-title" className="relative isolate overflow-hidden">
      <div aria-hidden="true" className="bg-grid absolute inset-0 -z-10" />
      <div
        aria-hidden="true"
        className="bg-glow-primary absolute -top-40 left-1/2 -z-10 size-[56rem] -translate-x-1/2"
      />
      <div
        aria-hidden="true"
        className="bg-glow-accent absolute top-40 -right-40 -z-10 size-[36rem]"
      />
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-6 pt-16 pb-20 md:pt-24 lg:grid-cols-[1.05fr_1fr]">
        <div className="flex flex-col gap-7">
          <p className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-surface/70 px-3 py-1 text-xs font-medium text-muted">
            <span aria-hidden="true" className="bg-brand-gradient size-2 rounded-full" />
            {t('hero.eyebrow')}
          </p>
          <h1
            id="hero-title"
            className="text-4xl leading-[1.1] font-semibold tracking-tight text-balance md:text-5xl xl:text-[3.5rem]"
          >
            {t('hero.title')} <span className="text-accent">{t('hero.titleAccent')}</span>
          </h1>
          <p className="max-w-xl text-lg text-pretty text-muted">{t('hero.subtitle')}</p>
          <div className="flex flex-wrap gap-3">
            <Button asChild className="h-11 px-5">
              <Link href="/login">
                <PlayCircle aria-hidden="true" />
                {t('hero.primaryCta')}
              </Link>
            </Button>
            <Button asChild variant="secondary" className="h-11 px-5">
              <a href="#contact">
                <MessagesSquare aria-hidden="true" />
                {t('hero.secondaryCta')}
              </a>
            </Button>
          </div>
          <p className="flex items-center gap-2 text-sm font-medium">
            <Briefcase aria-hidden="true" className="size-4 shrink-0 text-accent" />
            {t('professionalOnly')}
          </p>
          <p role="note" className="flex max-w-xl items-start gap-2 text-sm text-warning">
            <FlaskConical aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            {t('demoNotice')}
          </p>
        </div>
        <ProductPreview />
      </div>
    </section>
  );
}

const HOLDERS = [
  ['Alpine Capital Partners', '100', '2500'],
  ['Baltic Pension Fund', '250', '6250'],
  ['Cedar Family Office', '150', '3750'],
] as const;

/** A static picture of the issuer portal, with the demo data, clearly labelled as fictitious. */
async function ProductPreview() {
  const t = await getTranslations('landing.preview');
  const locale = await getLocale();
  const euros = (value: string, compact = false) =>
    new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: compact ? 1 : 0,
      ...(compact ? { notation: 'compact' as const } : {}),
    }).format(value as Intl.StringNumericLiteral);
  const nextCoupon = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date('2027-03-15T00:00:00Z'));
  return (
    <figure aria-label={t('label')} className="relative">
      <div
        aria-hidden="true"
        className="bg-brand-gradient absolute -inset-px rounded-2xl opacity-60 blur-sm"
      />
      <div className="relative flex flex-col gap-5 overflow-hidden rounded-2xl border border-border bg-surface p-6 shadow-2xl">
        <div className="relative -mx-6 -mt-6">
          <ProjectPhoto
            src="/images/projects/northwind-solar-plant.webp"
            alt={t('photoAlt')}
            sizes="(min-width: 1024px) 480px, 100vw"
            preload
            className="h-32 w-full sm:h-36"
          />
          <IllustrativeBadge className="absolute top-3 left-3" />
        </div>
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <p className="font-heading text-lg font-semibold">{t('title')}</p>
            <p className="text-sm text-muted">{t('subtitle')}</p>
            <p className="text-sm text-pretty">{t('description')}</p>
          </div>
          <span className="rounded-full border border-success/40 px-2.5 py-0.5 text-xs font-medium text-success">
            {t('status')}
          </span>
        </div>
        <dl className="grid grid-cols-3 gap-3">
          {[
            [t('nominal'), euros('1000000', true)],
            [t('holders'), '3'],
            [t('nextCoupon'), nextCoupon],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl bg-surface-raised p-3">
              <dt className="text-xs text-muted">{label}</dt>
              <dd className="mt-1 font-heading text-xl font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-col gap-2">
          <div className="flex justify-between text-xs text-muted">
            <span>{t('subscribed')}</span>
            <span className="tabular-nums">82 %</span>
          </div>
          <svg aria-hidden="true" className="h-1.5 w-full">
            <rect width="100%" height="100%" rx="3" className="fill-surface-raised" />
            <rect width="82%" height="100%" rx="3" className="fill-accent" />
          </svg>
        </div>
        <table className="w-full text-sm">
          <caption className="mb-2 text-left text-xs font-medium tracking-wider text-muted uppercase">
            {t('registry')}
          </caption>
          <thead className="sr-only">
            <tr>
              <th scope="col">{t('investor')}</th>
              <th scope="col">{t('units')}</th>
              <th scope="col">{t('coupon')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {HOLDERS.map(([name, units, coupon]) => (
              <tr key={name}>
                <td className="py-2">{name}</td>
                <td className="py-2 text-right text-muted tabular-nums">{units}</td>
                <td className="py-2 text-right font-medium tabular-nums">{euros(coupon)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <ul className="flex flex-col gap-2 text-xs">
          <li className="flex items-center gap-2 text-success">
            <BadgeCheck aria-hidden="true" className="size-4" />
            {t('fourEyes')}
          </li>
          <li className="flex items-center gap-2 text-accent">
            <Link2 aria-hidden="true" className="size-4" />
            {t('ledger')}
          </li>
        </ul>
        <figcaption className="border-t border-border pt-3">
          <YieldNotice />
        </figcaption>
      </div>
    </figure>
  );
}
