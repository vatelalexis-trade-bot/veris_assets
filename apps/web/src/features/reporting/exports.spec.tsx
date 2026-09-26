import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test/render';
import { Exports } from './exports';

const api = vi.hoisted(() => ({ GET: vi.fn(), POST: vi.fn() }));
vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api,
}));
const download = vi.hoisted(() => vi.fn());
vi.mock('@/features/documents/api', () => ({ downloadDocument: download }));

const ISSUANCE = '0199a000-0000-7000-8000-000000000001';

function withClient(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

beforeEach(() => {
  for (const mock of [api.GET, api.POST, download]) mock.mockReset();
  api.GET.mockImplementation(async (path: string) =>
    path === '/api/v1/issuances'
      ? { data: { data: [{ id: ISSUANCE, code: 'NWGN', name: 'Northwind Green Notes' }] } }
      : {
          data: [
            {
              id: 'e-1',
              kind: 'REGISTRY',
              issuanceId: ISSUANCE,
              status: 'DONE',
              documentId: 'doc-1',
              rowCount: 4,
              error: null,
              createdAt: '2026-09-26T08:00:00.000Z',
              finishedAt: '2026-09-26T08:00:02.000Z',
            },
            {
              id: 'e-2',
              kind: 'AUDIT',
              issuanceId: null,
              status: 'QUEUED',
              documentId: null,
              rowCount: null,
              error: null,
              createdAt: '2026-09-26T09:00:00.000Z',
              finishedAt: null,
            },
          ],
        },
  );
});

describe('CSV exports', () => {
  it('lists the exports, and downloads the ready ones', async () => {
    renderWithIntl(withClient(<Exports />));
    const ready = (await screen.findByText('Registry (positions)', { selector: 'td' })).closest(
      'tr',
    )!;
    expect(within(ready).getByText('NWGN')).toBeDefined();
    expect(within(ready).getByText('Ready')).toBeDefined();
    const queued = screen.getByText('Audit log', { selector: 'td' }).closest('tr')!;
    expect(within(queued).getByText('Queued')).toBeDefined();
    expect(within(queued).queryByRole('button', { name: 'Download' })).toBeNull();

    download.mockResolvedValue(null);
    fireEvent.click(within(ready).getByRole('button', { name: 'Download' }));
    await waitFor(() => expect(download).toHaveBeenCalledWith('doc-1'));
  });

  it('asks for an export of one issuance, with an idempotency key', async () => {
    api.POST.mockResolvedValue({ data: { id: 'e-3' } });
    renderWithIntl(withClient(<Exports />));
    await screen.findByRole('option', { name: 'Northwind Green Notes (NWGN)' });
    fireEvent.change(screen.getByLabelText('Export'), { target: { value: 'SUBSCRIPTIONS' } });
    fireEvent.change(screen.getByLabelText('Issuance'), { target: { value: ISSUANCE } });
    fireEvent.click(screen.getByRole('button', { name: 'Request the export' }));
    await waitFor(() => expect(api.POST).toHaveBeenCalled());
    const [path, options] = api.POST.mock.calls[0]!;
    expect(path).toBe('/api/v1/exports');
    expect(options.body).toEqual({ kind: 'SUBSCRIPTIONS', issuanceId: ISSUANCE });
    expect(options.params.header['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('never limits the audit log to an issuance', async () => {
    api.POST.mockResolvedValue({ data: { id: 'e-4' } });
    renderWithIntl(withClient(<Exports />));
    fireEvent.change(await screen.findByLabelText('Export'), { target: { value: 'AUDIT' } });
    expect(screen.queryByLabelText('Issuance')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Request the export' }));
    await waitFor(() => expect(api.POST).toHaveBeenCalled());
    expect(api.POST.mock.calls[0]![1].body).toEqual({ kind: 'AUDIT' });
  });
});
