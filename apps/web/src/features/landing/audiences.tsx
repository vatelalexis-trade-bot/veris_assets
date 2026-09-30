import { ArrowRight, Building2, Check, Cpu, LogIn, ShieldCheck, Wallet } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { Section } from './section';
import { technologyPath } from './technology-path';

const AUDIENCES = [
  ['issuers', Building2],
  ['investors', Wallet],
  ['compliance', ShieldCheck],
] as const;

/** What each kind of user gets (SPEC §4): why issuers, investors and compliance choose it. */
export async function Audiences() {
  const t = await getTranslations('landing.audiences');
  const locale = await getLocale();
  return (
    <Section
      id="roles"
      eyebrow={t('eyebrow')}
      title={t('title')}
      subtitle={t('subtitle')}
      className="bg-surface/30"
    >
      <ul className="grid gap-4 lg:grid-cols-3">
        {AUDIENCES.map(([key, Icon]) => (
          <li
            key={key}
            className="flex flex-col gap-5 rounded-2xl border border-border bg-background p-7"
          >
            <Icon aria-hidden="true" className="size-6 text-primary-text" />
            <div className="flex flex-col gap-2">
              <h3 className="text-xl font-semibold">{t(`${key}.title`)}</h3>
              <p className="text-sm text-pretty">{t(`${key}.lead`)}</p>
            </div>
            <ul className="flex flex-col gap-3 text-sm">
              {(['p1', 'p2', 'p3'] as const).map((point) => (
                <li key={point} className="flex gap-3">
                  <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-accent" />
                  <span className="text-muted">{t(`${key}.${point}`)}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-3">
        <Button asChild className="h-11 px-5">
          <Link href="/login">
            <LogIn aria-hidden="true" />
            {t('signIn')}
          </Link>
        </Button>
        <Button asChild variant="secondary" className="h-11 px-5">
          <Link href={technologyPath(locale)}>
            <Cpu aria-hidden="true" />
            {t('technology')}
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </Section>
  );
}
