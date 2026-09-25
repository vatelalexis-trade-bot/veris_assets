import { redirect } from '@/i18n/navigation';
import { PORTALS } from '@/features/navigation/portals';

// The portal home is its first menu entry.
export default async function PortalHome({ params }: PageProps<'/[locale]/issuer'>) {
  const { locale } = await params;
  redirect({ href: `${PORTALS.issuer.path}/${PORTALS.issuer.items[0]!.section}`, locale });
}
