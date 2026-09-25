import { redirect } from '@/i18n/navigation';
import { PORTALS } from '@/features/navigation/portals';

// The portal home is its first menu entry.
export default async function PortalHome({ params }: PageProps<'/[locale]/platform'>) {
  const { locale } = await params;
  redirect({ href: `${PORTALS.platform.path}/${PORTALS.platform.items[0]!.section}`, locale });
}
