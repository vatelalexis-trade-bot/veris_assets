import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test/render';
import { UploadForm } from '@/features/documents/upload-form';
import { bodyOf, EMPTY_INVESTOR } from './investor-form';
import { KycPanel } from './kyc-panel';

const api = vi.hoisted(() => ({ GET: vi.fn(), POST: vi.fn() }));
vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api,
}));

const INVESTOR = '0192a000-0000-7000-8000-000000000001';
const CASE = {
  id: '0192a000-0000-7000-8000-0000000000c1',
  investorId: INVESTOR,
  status: 'PENDING_REVIEW',
  preparedBy: '0192a000-0000-7000-8000-0000000000aa',
  preparedAt: '2026-09-20T09:00:00.000Z',
  decidedBy: null,
  decidedAt: null,
  decisionComment: null,
  validUntil: null,
  providerReference: 'FAKE-KYC-0123456789AB',
  providerOutcome: 'CLEAR',
  suggestedRiskLevel: 'LOW',
  updatedAt: '2026-09-20T09:00:00.000Z',
  documents: [],
};

function withClient(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

beforeEach(() => {
  api.GET.mockReset();
  api.POST.mockReset();
  api.GET.mockImplementation(async (path: string) =>
    path === '/api/v1/kyc-cases'
      ? { data: { data: [{ ...CASE, investorName: 'Alpine (demo)' }] } }
      : { data: CASE },
  );
  api.POST.mockResolvedValue({ data: CASE });
});

describe('investor form', () => {
  it('sends empty texts as null, and the address only when complete', () => {
    const body = bodyOf({
      ...EMPTY_INVESTOR,
      legalName: ' Alpine SAS ',
      countryOfIncorporation: 'FR',
      line1: '1 Rue',
    });
    expect(body).toMatchObject({
      legalName: 'Alpine SAS',
      tradeName: null,
      taxId: null,
      address: null,
    });
    expect(
      bodyOf({
        ...EMPTY_INVESTOR,
        line1: '1 Rue',
        postalCode: '75001',
        city: 'Paris',
        addressCountry: 'FR',
      }).address,
    ).toEqual({
      line1: '1 Rue',
      line2: null,
      postalCode: '75001',
      city: 'Paris',
      countryCode: 'FR',
    });
  });
});

describe('KycPanel', () => {
  it('shows the provider’s recommendation and requires a comment to reject', async () => {
    renderWithIntl(
      withClient(
        <KycPanel investorId={INVESTOR} rights={{ canPrepare: false, canDecide: true }} />,
      ),
      'fr-FR',
    );
    expect(await screen.findByText(/Rien de signalé · risque suggéré : faible/)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Refuser' }));
    const dialog = await screen.findByRole('dialog');
    const confirm = within(dialog).getByRole('button', { name: 'Refuser' });
    expect(confirm.hasAttribute('disabled')).toBe(true);
    fireEvent.change(within(dialog).getByLabelText('Commentaire (obligatoire)'), {
      target: { value: 'Extrait trop ancien' },
    });
    fireEvent.click(confirm);
    await waitFor(() =>
      expect(api.POST).toHaveBeenCalledWith('/api/v1/kyc-cases/{id}/reject', {
        params: { path: { id: CASE.id }, header: { 'Idempotency-Key': expect.any(String) } },
        body: { comment: 'Extrait trop ancien' },
      }),
    );
  });

  it('tells the preparer that a Compliance Officer decides', async () => {
    renderWithIntl(
      withClient(
        <KycPanel investorId={INVESTOR} rights={{ canPrepare: true, canDecide: false }} />,
      ),
    );
    expect(
      await screen.findByText('Waiting for the decision of a Compliance Officer.'),
    ).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
  });
});

describe('UploadForm', () => {
  it('refuses a file over 10 MB before sending it', async () => {
    renderWithIntl(withClient(<UploadForm types={['REPORT']} />));
    const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'big.pdf', {
      type: 'application/pdf',
    });
    fireEvent.change(screen.getByLabelText('File'), { target: { files: [big] } });
    expect(await screen.findByText('This file is over 10 MB.')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Upload' }).hasAttribute('disabled')).toBe(true);
  });

  it('sends the file and its fields as a multipart form, with an idempotency key', async () => {
    renderWithIntl(
      withClient(
        <UploadForm
          types={['KYC_EVIDENCE', 'INVESTOR_DOCUMENT']}
          investorId={INVESTOR}
          chooseConfidentiality
        />,
      ),
    );
    const file = new File(['%PDF-1.4'], 'extract.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText('File'), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'Upload' }));
    await waitFor(() => expect(api.POST).toHaveBeenCalled());
    const [path, options] = api.POST.mock.calls[0] as [
      string,
      { params: { header: Record<string, string> }; bodySerializer: () => FormData },
    ];
    expect(path).toBe('/api/v1/documents');
    expect(options.params.header['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/);
    const form = options.bodySerializer();
    expect(form.get('file')).toBe(file);
    expect(Object.fromEntries([...form.entries()].filter(([name]) => name !== 'file'))).toEqual({
      type: 'KYC_EVIDENCE',
      name: 'extract.pdf',
      confidentiality: 'CONFIDENTIAL',
      ownerType: 'INVESTOR',
      investorId: INVESTOR,
    });
  });
});
