'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ALLOWED_DOCUMENT_MIME_TYPES,
  DOCUMENT_CONFIDENTIALITY,
  MAX_DOCUMENT_SIZE_BYTES,
  type DocumentConfidentiality,
  type DocumentType,
} from '@virtus/shared';
import { useTranslations } from 'next-intl';
import { useRef, useState, type FormEvent } from 'react';
import { ApiError } from '@/components/app/api-error';
import { FormField } from '@/components/app/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useIdempotencyKey } from '@/lib/api/idempotency';
import { uploadDocument, type DocumentView } from './api';

interface UploadFormProps {
  /** Types the user may give (an investor: its own documents and its KYC evidence). */
  types: readonly DocumentType[];
  investorId?: string;
  /** Staff choose who may read the document; an investor's documents get it from their type. */
  chooseConfidentiality?: boolean;
  onUploaded?: (document: Omit<DocumentView, 'versions'>) => void;
}

/** Upload of one file (SPEC §16): PDF, PNG, JPEG, CSV or XLSX, 10 MB at most. */
export function UploadForm({
  types,
  investorId,
  chooseConfidentiality,
  onUploaded,
}: UploadFormProps) {
  const t = useTranslations('documents');
  const queryClient = useQueryClient();
  const idempotency = useIdempotencyKey();
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [type, setType] = useState<DocumentType>(types[0]!);
  const [name, setName] = useState('');
  const [confidentiality, setConfidentiality] = useState<DocumentConfidentiality>(
    investorId ? 'INVESTOR_VISIBLE' : 'INTERNAL',
  );
  const tooBig = file !== null && file.size > MAX_DOCUMENT_SIZE_BYTES;

  const upload = useMutation({
    mutationFn: async () => {
      const { data, error } = await uploadDocument(
        {
          type,
          name: name.trim() || file!.name,
          ...(chooseConfidentiality
            ? { confidentiality: type === 'KYC_EVIDENCE' ? 'CONFIDENTIAL' : confidentiality }
            : {}),
          ...(investorId ? { ownerType: 'INVESTOR' as const, investorId } : {}),
        },
        file!,
        idempotency.header(),
      );
      idempotency.answered();
      if (error) throw error;
      return data;
    },
    onSuccess: async (created) => {
      setFile(null);
      setName('');
      if (fileInput.current) fileInput.current.value = '';
      await queryClient.invalidateQueries({ queryKey: ['documents'] });
      onUploaded?.(created);
    },
  });

  return (
    <form
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        upload.mutate();
      }}
      className="grid gap-3 rounded-xl border border-border bg-surface p-4 md:grid-cols-2"
      noValidate
    >
      <FormField
        label={t('upload.file')}
        hint={t('upload.hint')}
        error={tooBig ? t('upload.tooBig') : undefined}
      >
        <Input
          ref={fileInput}
          type="file"
          accept={[...ALLOWED_DOCUMENT_MIME_TYPES, '.csv', '.xlsx'].join(',')}
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
      </FormField>
      <FormField label={t('upload.name')}>
        <Input
          value={name}
          placeholder={file?.name}
          onChange={(event) => setName(event.target.value)}
        />
      </FormField>
      <FormField label={t('columns.type')}>
        <Select value={type} onChange={(event) => setType(event.target.value as DocumentType)}>
          {types.map((value) => (
            <option key={value} value={value}>
              {t(`types.${value}`)}
            </option>
          ))}
        </Select>
      </FormField>
      {chooseConfidentiality && type !== 'KYC_EVIDENCE' ? (
        <FormField label={t('columns.confidentiality')}>
          <Select
            value={confidentiality}
            onChange={(event) => setConfidentiality(event.target.value as DocumentConfidentiality)}
          >
            {DOCUMENT_CONFIDENTIALITY.filter(
              (value) => investorId || value !== 'INVESTOR_VISIBLE',
            ).map((value) => (
              <option key={value} value={value}>
                {t(`confidentiality.${value}`)}
              </option>
            ))}
          </Select>
        </FormField>
      ) : null}
      <div className="flex flex-col gap-2 md:col-span-2">
        {upload.isError ? <ApiError error={upload.error} /> : null}
        {upload.isSuccess ? (
          <p role="status" className="text-sm text-success">
            {t('upload.done')}
          </p>
        ) : null}
        <Button type="submit" className="self-start" disabled={!file || tooBig || upload.isPending}>
          {t('upload.submit')}
        </Button>
      </div>
    </form>
  );
}
