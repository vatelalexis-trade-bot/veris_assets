import { setRequestLocale } from 'next-intl/server';
import { use } from 'react';
import { SectionPlaceholder, sectionParams } from '@/features/navigation/section-placeholder';

export function generateStaticParams() {
  return sectionParams('issuer');
}

export default function SectionPage({ params }: PageProps<'/[locale]/issuer/[section]'>) {
  const { locale, section } = use(params);
  setRequestLocale(locale);
  return <SectionPlaceholder portalId="issuer" section={section} />;
}
