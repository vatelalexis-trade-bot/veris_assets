import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test/render';
import { TransferForm } from './transfer-form';

const api = vi.hoisted(() => ({ GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn() }));
const push = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api,
}));
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
  Link: ({ children }: { children: ReactNode }) => children,
}));

const ISSUANCE = '0192a000-0000-7000-8000-000000000070';
const TRANSFER = '0192a000-0000-7000-8000-000000000071';

function withClient(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

beforeEach(() => {
  for (const mock of [api.GET, api.POST, api.PATCH, push]) mock.mockReset();
  api.GET.mockResolvedValue({
    data: {
      data: [
        {
          issuanceName: 'Northwind Private Debt Fund I',
          quantityHeld: '100',
          quantityAvailable: '60',
        },
      ],
    },
  });
});

async function fill(code: string, quantity: string) {
  fireEvent.change(await screen.findByLabelText('Recipient code'), { target: { value: code } });
  fireEvent.change(screen.getByLabelText('Number of units'), { target: { value: quantity } });
}

describe('transfer form', () => {
  it('limits the request to the available units', async () => {
    renderWithIntl(withClient(<TransferForm issuanceId={ISSUANCE} />));
    expect(
      await screen.findByText('Northwind Private Debt Fund I: 60 units available out of 100 held.'),
    ).toBeDefined();
    await fill('VA-ABCD-EFGH', '70');
    expect(screen.getByText('Enter a whole number of units, between 1 and 60.')).toBeDefined();
    expect(
      (screen.getByRole('button', { name: 'Submit the request' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('creates the draft, submits it, and opens the request', async () => {
    api.POST.mockResolvedValue({ data: { id: TRANSFER, version: 1 } });
    renderWithIntl(withClient(<TransferForm issuanceId={ISSUANCE} />));
    await fill('va-abcd-efgh', '40');
    fireEvent.click(screen.getByRole('button', { name: 'Submit the request' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/portal/transfers/${TRANSFER}`));
    expect(api.POST.mock.calls[0]![1].body).toEqual({
      issuanceId: ISSUANCE,
      recipientCode: 'va-abcd-efgh',
      quantity: '40',
      indicativePrice: null,
    });
  });

  it('explains a refused recipient without telling who it is (D-010)', async () => {
    api.POST.mockImplementation(async (path: string) =>
      path.endsWith('submit')
        ? { error: { error: { code: 'RECIPIENT_NOT_ELIGIBLE', message: 'x', details: [] } } }
        : { data: { id: TRANSFER, version: 1 } },
    );
    renderWithIntl(withClient(<TransferForm issuanceId={ISSUANCE} />));
    await fill('VA-ABCD-EFGH', '10');
    fireEvent.click(screen.getByRole('button', { name: 'Submit the request' }));
    expect(await screen.findByText('The recipient is not eligible.')).toBeDefined();
    expect(push).not.toHaveBeenCalled();
  });
});
