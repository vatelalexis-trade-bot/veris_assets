import { Briefcase, MapPin, ShieldAlert } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { Tabs } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { Carousel } from './carousel';
import { IllustrativeBadge, YieldNotice } from './illustrative';
import { ProjectPhoto } from './project-photo';
import { EXAMPLE_PROJECTS, type ExampleProject, type ProjectStatus } from './projects';
import { Section } from './section';

const FILTERS = ['all', 'open', 'upcoming', 'closed'] as const;

const STATUS_TONE: Record<ProjectStatus, string> = {
  open: 'border-success/60 text-success',
  upcoming: 'border-accent/60 text-accent',
  closed: 'border-border text-muted',
};

/**
 * Illustrative projects, as an issuer could run them on the platform: none is real, none is
 * offered. No way to invest from here, only the demo and the team (brief of the landing page).
 */
export async function ProjectsSection() {
  const t = await getTranslations('landing.projects');
  const locale = (await getLocale()) as 'en-GB' | 'fr-FR';
  const cards = (status: (typeof FILTERS)[number]) =>
    EXAMPLE_PROJECTS.filter((project) => status === 'all' || project.status === status).map(
      (project) => (
        <li
          key={project.id}
          className="flex shrink-0 basis-[85%] snap-start sm:basis-[calc((100%-1rem)/2)] lg:basis-[calc((100%-2rem)/3)]"
        >
          <ProjectCard
            project={project}
            headingId={`${status}-${project.id}`}
            locale={locale}
            t={t}
          />
        </li>
      ),
    );
  return (
    <Section
      id="projects"
      eyebrow={t('eyebrow')}
      title={t('title')}
      subtitle={t('subtitle')}
      className="bg-surface/30"
    >
      <aside className="flex flex-col gap-3 rounded-2xl border border-warning/40 bg-background px-6 py-5 text-sm md:flex-row md:gap-4">
        <ShieldAlert aria-hidden="true" className="size-5 shrink-0 text-warning" />
        <div className="flex flex-col gap-1.5">
          <p className="font-medium">{t('notice.title')}</p>
          <p className="text-muted">{t('notice.text')}</p>
          <p className="flex items-center gap-2 font-medium">
            <Briefcase aria-hidden="true" className="size-4 shrink-0 text-accent" />
            {t('notice.professional')}
          </p>
        </div>
      </aside>
      <Tabs
        label={t('filters.label')}
        items={FILTERS.map((filter) => {
          const items = cards(filter);
          return {
            value: filter,
            label: t('filters.tab', { name: t(`filters.${filter}`), count: items.length }),
            content: <Carousel label={t(`filters.${filter}`)}>{items}</Carousel>,
          };
        })}
      />
    </Section>
  );
}

function ProjectCard({
  project,
  headingId,
  locale,
  t,
}: {
  project: ExampleProject;
  /** The same project is shown in two tabs ("all" and its status): ids differ by tab. */
  headingId: string;
  locale: 'en-GB' | 'fr-FR';
  t: Awaited<ReturnType<typeof getTranslations<'landing.projects'>>>;
}) {
  const text = project.text[locale];
  const amount = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'EUR',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(project.amount as Intl.StringNumericLiteral);
  const rate = new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  }).format(project.targetRate as Intl.StringNumericLiteral);
  const term =
    project.termMonths % 12 === 0
      ? t('years', { count: project.termMonths / 12 })
      : t('months', { count: project.termMonths });
  return (
    <article
      aria-labelledby={headingId}
      className="flex w-full flex-col overflow-hidden rounded-2xl border border-border bg-background"
    >
      <div className="relative">
        <ProjectPhoto
          src={project.image.src}
          alt={project.image.alt[locale]}
          sizes="(min-width: 1024px) 400px, (min-width: 640px) 50vw, 85vw"
          className="h-40 w-full"
        />
        <span
          className={cn(
            'absolute top-3 left-3 rounded-full border bg-background/90 px-2.5 py-0.5 text-xs font-semibold',
            STATUS_TONE[project.status],
          )}
        >
          {t(`status.${project.status}`)}
        </span>
        <IllustrativeBadge className="absolute top-3 right-3" />
      </div>
      <div className="flex flex-1 flex-col gap-4 p-5">
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-semibold tracking-wider text-accent uppercase">
            {t(`kinds.${project.kind}`)}
          </p>
          <h3 id={headingId} className="text-lg font-semibold">
            {text.name}
          </h3>
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
            {text.location}
          </p>
        </div>
        <p className="text-sm text-pretty text-muted">{text.description}</p>
        <dl className="mt-auto grid grid-cols-3 gap-2">
          {(
            [
              [t('amount'), amount],
              [t('targetYield'), rate],
              [t('term'), term],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="rounded-xl bg-surface p-2.5">
              <dt className="text-[11px] leading-tight text-muted">{label}</dt>
              <dd className="mt-0.5 font-heading font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        <YieldNotice className="text-[11px]" />
      </div>
    </article>
  );
}
