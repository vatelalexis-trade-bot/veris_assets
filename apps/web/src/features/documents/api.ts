import type { DocumentConfidentiality, DocumentType } from '@virtus/shared';
import { api } from '@/lib/api/client';
import type { operations } from '@/lib/api/schema';

export type DocumentView =
  operations['DocumentsController_get']['responses'][200]['content']['application/json'];

export interface UploadFields {
  type: DocumentType;
  name: string;
  confidentiality?: DocumentConfidentiality;
  ownerType?: 'INVESTOR' | 'ISSUANCE' | 'TENANT';
  investorId?: string;
}

/** Multipart body: the file plus its text fields (the typed client sends JSON otherwise). */
function formData(fields: Record<string, string | undefined>, file: File): FormData {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields))
    if (value !== undefined) form.append(name, value);
  form.append('file', file);
  return form;
}

export async function uploadDocument(
  fields: UploadFields,
  file: File,
  header: { 'Idempotency-Key': string },
) {
  return api.POST('/api/v1/documents', {
    params: { header },
    // The generated type describes the multipart fields; the serializer builds the real body.
    body: fields as never,
    bodySerializer: () => formData({ ...fields }, file),
  });
}

/** Opens the file of a document through a download link valid 5 minutes (D-045). */
export async function downloadDocument(id: string, version?: number): Promise<unknown> {
  const { data, error } = await api.POST('/api/v1/documents/{id}/download-url', {
    params: { path: { id } },
    body: version ? { version } : {},
  });
  if (error) return error;
  const link = document.createElement('a');
  link.href = data.url;
  link.rel = 'noopener';
  link.click();
  return null;
}
