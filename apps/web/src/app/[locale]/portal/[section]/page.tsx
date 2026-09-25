import { setRequestLocale } from 'next-intl/server';
import { use } from 'react';
import { SectionPlaceholder, sectionParams } from '@/features/navigation/section-placeholder';

export function generateStaticParams() {
  return sectionParams('investor');
}

export default function SectionPage({ params }: PageProps<'/[locale]/portal/[section]'>) {
  const { locale, section } = use(params);
  setRequestLocale(locale);
  return <SectionPlaceholder portalId="investor" section={section} />;
}
