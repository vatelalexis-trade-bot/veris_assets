import { setRequestLocale } from 'next-intl/server';
import { ErrorState } from '@/components/app/error-state';
import { userPermissions } from '@/features/auth/require-permission';
import { IssuanceWizard } from '@/features/issuances/wizard/issuance-wizard';

/** The creation wizard of a draft (SPEC §6.2). */
export default async function EditIssuancePage({
  params,
}: PageProps<'/[locale]/issuer/issuances/[id]/edit'>) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const permissions = await userPermissions();
  if (!permissions['issuance:edit']) return <ErrorState code="PERMISSION_DENIED" />;
  return <IssuanceWizard id={id} canSubmit={Boolean(permissions['issuance:submit'])} />;
}
