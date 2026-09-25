import { Construction } from 'lucide-react';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/app/empty-state';
import { ErrorState } from '@/components/app/error-state';
import { PageHeader } from '@/components/app/page-header';
import { getCurrentUser } from '@/lib/api/server';
import { findSection, PORTALS, type PortalId } from './portals';

/**
 * Placeholder of a menu entry whose screen is built in a later phase. Unknown sections give the
 * "page not found" screen; sections the user may not open give a refusal (the API refuses the
 * data anyway). Dedicated pages (e.g. issuer/settings/page.tsx) take precedence.
 */
export async function SectionPlaceholder({
  portalId,
  section,
}: {
  portalId: PortalId;
  section: string;
}) {
  const t = await getTranslations();
  const item = findSection(PORTALS[portalId], section);
  if (!item) notFound();
  const user = await getCurrentUser();
  if (!user?.permissions[item.permission]) return <ErrorState code="PERMISSION_DENIED" />;
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
