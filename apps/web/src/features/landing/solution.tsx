import { Route, Target, TriangleAlert } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { cn } from '@/lib/utils';
import { ProjectPhoto } from './project-photo';
import { EXAMPLE_PROJECTS } from './projects';
import { Section } from './section';

const PILLARS = [
  ['problem', TriangleAlert, 'text-warning'],
  ['approach', Route, 'text-primary-text'],
  ['goal', Target, 'text-accent'],
] as const;

/** Each type of asset is shown with the photo of one of the illustrative projects. */
const ASSET_TYPES = (
  [
    ['realEstate', 'loire-riverside-homes'],
    ['greenEnergy', 'alentejo-sun-farms'],
    ['realAssets', 'hanse-charge-network'],
  ] as const
).map(([key, projectId]) => {
  const project = EXAMPLE_PROJECTS.find(({ id }) => id === projectId);
  if (!project) throw new Error(`Unknown illustrative project: ${projectId}`);
  return [key, project.image] as const;
});

/** What Veris Assets does: the problem, the approach, the goal, and the assets it serves. */
export async function Solution() {
  const t = await getTranslations('landing.solution');
  const locale = (await getLocale()) as 'en-GB' | 'fr-FR';
  return (
    <Section id="solution" eyebrow={t('eyebrow')} title={t('title')} subtitle={t('subtitle')}>
      <ol className="grid gap-4 lg:grid-cols-3">
        {PILLARS.map(([key, Icon, tone], index) => (
          <li
            key={key}
            className="relative flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6"
          >
            {index > 0 ? (
              <span
                aria-hidden="true"
                className="bg-brand-gradient absolute top-1/2 -left-4 hidden h-px w-4 lg:block"
              />
            ) : null}
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-surface-raised">
                <Icon aria-hidden="true" className={cn('size-5', tone)} />
              </span>
              <h3 className="text-lg font-semibold">{t(`${key}.title`)}</h3>
            </div>
            <p className="text-sm text-pretty text-muted">{t(`${key}.text`)}</p>
          </li>
        ))}
      </ol>
      <div className="flex flex-col gap-5">
        <h3 className="text-xl font-semibold">{t('assets.title')}</h3>
        <ul className="grid gap-4 md:grid-cols-3">
          {ASSET_TYPES.map(([key, photo]) => (
            <li key={key} className="overflow-hidden rounded-2xl border border-border bg-surface">
              <ProjectPhoto
                src={photo.src}
                alt={photo.alt[locale]}
                sizes="(min-width: 768px) 33vw, 100vw"
                className="h-28 w-full"
              />
              <div className="flex flex-col gap-1.5 p-5">
                <p className="font-heading font-semibold">{t(`assets.${key}.title`)}</p>
                <p className="text-sm text-muted">{t(`assets.${key}.text`)}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}
