import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { TechnologyPage } from '@/features/landing/technology-page';
import { redirect } from '@/i18n/navigation';

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/technology'>): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'technology' });
  return { title: t('metaTitle') };
}

/** Technology page: /en/technology; the other language has its own address (D-108). */
export default async function Page({ params }: PageProps<'/[locale]/technology'>) {
  const { locale } = await params;
  if (locale === 'fr-FR') redirect({ href: '/technologie', locale });
  setRequestLocale(locale);
  return <TechnologyPage />;
}
