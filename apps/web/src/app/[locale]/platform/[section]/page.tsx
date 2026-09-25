import { setRequestLocale } from 'next-intl/server';
import { use } from 'react';
import { SectionPlaceholder, sectionParams } from '@/features/navigation/section-placeholder';

export function generateStaticParams() {
  return sectionParams('platform');
}

export default function SectionPage({ params }: PageProps<'/[locale]/platform/[section]'>) {
  const { locale, section } = use(params);
  setRequestLocale(locale);
  return <SectionPlaceholder portalId="platform" section={section} />;
}
