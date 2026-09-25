import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ErrorState } from '@/components/app/error-state';
import { PageHeader } from '@/components/app/page-header';
import { userPermissions } from '@/features/auth/require-permission';
import { DocumentsTable } from '@/features/documents/documents-table';
import { UploadForm } from '@/features/documents/upload-form';

/** The investor's own documents (SPEC §4.5): download, and upload of its documents and KYC evidence. */
export default async function OwnDocumentsPage({
  params,
}: PageProps<'/[locale]/portal/documents'>) {
  const { locale } = await params;
  setRequestLocale(locale);
  const permissions = await userPermissions();
  if (!permissions['document:read']) return <ErrorState code="PERMISSION_DENIED" />;
  const t = await getTranslations('documents');
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('ownTitle')} description={t('ownDescription')} />
      <DocumentsTable />
      {permissions['document:upload'] ? (
        <section className="flex flex-col gap-2">
          <h2 className="font-heading text-lg font-semibold">{t('upload.title')}</h2>
          <UploadForm types={['INVESTOR_DOCUMENT', 'KYC_EVIDENCE']} />
        </section>
      ) : null}
    </div>
  );
}
