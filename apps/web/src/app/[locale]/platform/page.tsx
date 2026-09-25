import { PORTALS, visibleItems } from '@/features/navigation/portals';
import { redirect } from '@/i18n/navigation';
import { getCurrentUser } from '@/lib/api/server';

// The portal home is the first menu entry the user may open.
export default async function PortalHome({ params }: PageProps<'/[locale]/platform'>) {
  const { locale } = await params;
  const user = await getCurrentUser();
  const first = visibleItems(PORTALS.platform, Object.keys(user?.permissions ?? {}))[0];
  redirect({ href: first ? `${PORTALS.platform.path}/${first.section}` : '/', locale });
}
