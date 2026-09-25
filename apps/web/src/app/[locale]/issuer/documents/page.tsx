import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ErrorState } from '@/components/app/error-state';
import { PageHeader } from '@/components/app/page-header';
import { userPermissions } from '@/features/auth/require-permission';
import { DocumentsTable } from '@/features/documents/documents-table';
import { UploadForm } from '@/features/documents/upload-form';

/** Documents of the organisation (SPEC §16). */
export default async function DocumentsPage({ params }: PageProps<'/[locale]/issuer/documents'>) {
  const { locale } = await params;
  setRequestLocale(locale);
  const permissions = await userPermissions();
  if (!permissions['document:read']) return <ErrorState code="PERMISSION_DENIED" />;
  const t = await getTranslations('documents');
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('title')} description={t('description')} />
      <DocumentsTable />
      {permissions['document:upload'] ? (
        <section className="flex flex-col gap-2">
          <h2 className="font-heading text-lg font-semibold">{t('upload.title')}</h2>
          <UploadForm types={['REPORT', 'ISSUANCE_DOCUMENT']} chooseConfidentiality />
        </section>
      ) : null}
    </div>
  );
}
