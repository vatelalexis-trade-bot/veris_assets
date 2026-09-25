import { Construction } from 'lucide-react';
import { notFound } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { EmptyState } from '@/components/app/empty-state';
import { PageHeader } from '@/components/app/page-header';
import { findSection, PORTALS, type PortalId } from './portals';

/**
 * Placeholder of a menu entry whose screen is built in a later phase. Unknown sections give the
 * "page not found" screen. Dedicated pages (e.g. issuer/issuances/page.tsx) take precedence.
 */
export function SectionPlaceholder({ portalId, section }: { portalId: PortalId; section: string }) {
  const t = useTranslations();
  const item = findSection(PORTALS[portalId], section);
  if (!item) notFound();
  return (
    <>
      <PageHeader title={t(`navigation.${portalId}.${item.section}`)} />
      <EmptyState
        icon={Construction}
        title={t('placeholder.title')}
        description={t('placeholder.description')}
      />
    </>
  );
}

export function sectionParams(portalId: PortalId) {
  return PORTALS[portalId].items.map(({ section }) => ({ section }));
}
