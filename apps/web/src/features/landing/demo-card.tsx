import { ArrowRight, Check } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';

/** Next to the contact form: the way into the demonstration, with its limits (SPEC §3.3). */
export async function DemoCard() {
  const t = await getTranslations('landing.contact');
  return (
    <aside className="relative h-fit">
      <div
        aria-hidden="true"
        className="bg-brand-gradient absolute -inset-px rounded-2xl opacity-40"
      />
      <div className="relative flex flex-col gap-5 rounded-2xl bg-surface p-6 md:p-8">
        <h3 className="text-xl font-semibold">{t('demoTitle')}</h3>
        <p className="text-sm text-muted">{t('demoText')}</p>
        <ul className="flex flex-col gap-3 text-sm">
          {(['p1', 'p2', 'p3'] as const).map((point) => (
            <li key={point} className="flex gap-3">
              <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-accent" />
              {t(`demoPoints.${point}`)}
            </li>
          ))}
        </ul>
        <Button asChild variant="secondary" className="h-11 w-fit px-5">
          <Link href="/login">
            {t('demoCta')}
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </aside>
  );
}
