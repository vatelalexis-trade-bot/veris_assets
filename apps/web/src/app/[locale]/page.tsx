import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Calculator } from '@/features/calculator/calculator';
import { Audiences } from '@/features/landing/audiences';
import { ContactForm } from '@/features/landing/contact-form';
import { DemoCard } from '@/features/landing/demo-card';
import { Hero } from '@/features/landing/hero';
import { Lifecycle } from '@/features/landing/lifecycle';
import { ProjectsSection } from '@/features/landing/projects-section';
import { Section } from '@/features/landing/section';
import { Security } from '@/features/landing/security';
import { SiteFooter } from '@/features/landing/site-footer';
import { SiteHeader } from '@/features/landing/site-header';
import { Solution } from '@/features/landing/solution';
import { getCurrentUser } from '@/lib/api/server';

export async function generateMetadata({ params }: PageProps<'/[locale]'>): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'landing' });
  return { title: t('metaTitle') };
}

/**
 * Public site (SPEC §19, §19.1): what the platform does, the business case calculator and the
 * contact form. Proposal made without the HTML prototype (D-019, D-096), to be refined.
 */
export default async function HomePage({ params }: PageProps<'/[locale]'>) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [user, calculator, contact] = await Promise.all([
    getCurrentUser(),
    getTranslations('calculator'),
    getTranslations('landing.contact'),
  ]);
  return (
    <>
      <SiteHeader user={user} />
      <main>
        <Hero />
        <Solution />
        <Audiences />
        <Security />
        <ProjectsSection />
        <Lifecycle />
        <Section
          id="calculator"
          eyebrow={calculator('eyebrow')}
          title={calculator('title')}
          subtitle={calculator('subtitle')}
          className="bg-surface/30"
        >
          <Calculator />
        </Section>
        <Section
          id="contact"
          eyebrow={contact('eyebrow')}
          title={contact('title')}
          subtitle={contact('subtitle')}
        >
          <div className="grid gap-8 lg:grid-cols-[1.5fr_1fr]">
            <ContactForm />
            <DemoCard />
          </div>
        </Section>
      </main>
      <SiteFooter />
    </>
  );
}
