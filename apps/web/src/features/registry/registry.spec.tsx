import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IssuanceView } from '@/features/issuances/types';
import { renderWithIntl } from '@/test/render';
import { AllocationTab } from './allocation-tab';
import type { AllocationRoundView } from './types';

const api = vi.hoisted(() => ({ GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn() }));
vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api,
}));

const ISSUANCE = '0192a000-0000-7000-8000-000000000030';
const issuance = { id: ISSUANCE, status: 'SUBSCRIPTION_CLOSED' } as IssuanceView;

function round(changes: Partial<AllocationRoundView> = {}): AllocationRoundView {
  return {
    id: '0192a000-0000-7000-8000-000000000031',
    issuanceId: ISSUANCE,
    status: 'DRAFT',
    method: 'MANUAL',
    minimumWaiverJustification: null,
    proposedBy: null,
    proposedByName: null,
    proposedAt: null,
    validatedBy: null,
    validatedByName: null,
    validatedAt: null,
    rejectionComment: null,
    version: 3,
    createdAt: '2026-09-26T08:00:00.000Z',
    issuance: {
      id: ISSUANCE,
      name: 'Northwind Infrastructure Notes 2026',
      code: 'NWIN26',
      status: 'SUBSCRIPTION_CLOSED',
      currency: 'EUR',
      nominalValue: '1000.00',
      totalUnits: '1000',
      minimumAmount: '500000.00',
    },
    lines: [
      {
        subscriptionId: '0192a000-0000-7000-8000-000000000041',
        investorId: '0192a000-0000-7000-8000-000000000051',
        investorName: 'Alpine Capital Partners SAS (demo)',
        requestedUnits: '500',
        allocatedUnits: '500',
        amount: '500000.00',
        subscriptionStatus: 'APPROVED',
      },
      {
        subscriptionId: '0192a000-0000-7000-8000-000000000042',
        investorId: '0192a000-0000-7000-8000-000000000052',
        investorName: 'Baltic Pension Fund SICAV (demo)',
        requestedUnits: '700',
        allocatedUnits: '700',
        amount: '700000.00',
        subscriptionStatus: 'APPROVED',
      },
    ],
    totals: { requestedUnits: '1200', allocatedUnits: '1200', allocatedAmount: '1200000.00' },
    failures: [
      {
        code: 'ALLOCATION_EXCEEDS_SUPPLY',
        subscriptionId: null,
        meta: { totalUnits: '1000', allocatedUnits: '1200' },
      },
    ],
    ...changes,
  };
}

function withClient(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

const rights = { canPrepare: true, canValidate: true };

beforeEach(() => {
  api.GET.mockReset();
  api.POST.mockReset();
  api.PATCH.mockReset();
});

describe('allocation tab', () => {
  it('shows the oversubscription, recomputes the totals and saves with the version', async () => {
    api.GET.mockResolvedValue({ data: [round()] });
    api.PATCH.mockResolvedValue({ data: round({ version: 4 }) });
    renderWithIntl(
      withClient(<AllocationTab issuance={issuance} rights={rights} currentUserId="me" />),
    );
    expect(await screen.findByText('1200 of 1000')).toBeDefined();
    expect(screen.getByRole('alert').textContent).toContain('(1200 units for 1000 available)');

    fireEvent.change(screen.getByLabelText('Units allocated to Baltic Pension Fund SICAV (demo)'), {
      target: { value: '500' },
    });
    expect(screen.getByText('1000 of 1000')).toBeDefined();
    expect(screen.getByText('€1,000,000.00')).toBeDefined();
    // Proposing waits for the changes to be saved.
    expect(
      (screen.getByRole('button', { name: 'Propose for validation' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.PATCH).toHaveBeenCalledOnce());
    expect(api.PATCH.mock.calls[0]![1]).toMatchObject({
      headers: { 'If-Match': '"3"' },
      body: {
        lines: [
          { subscriptionId: '0192a000-0000-7000-8000-000000000041', allocatedUnits: '500' },
          { subscriptionId: '0192a000-0000-7000-8000-000000000042', allocatedUnits: '500' },
        ],
      },
    });
  });

  it('flags more units than requested, and asks a justification below the minimum', async () => {
    api.GET.mockResolvedValue({ data: [round()] });
    renderWithIntl(
      withClient(<AllocationTab issuance={issuance} rights={rights} currentUserId="me" />),
    );
    fireEvent.change(
      await screen.findByLabelText('Units allocated to Alpine Capital Partners SAS (demo)'),
      { target: { value: '501' } },
    );
    expect(screen.getByText('More than requested')).toBeDefined();
    fireEvent.change(screen.getByLabelText('Units allocated to Baltic Pension Fund SICAV (demo)'), {
      target: { value: '0' },
    });
    fireEvent.change(
      screen.getByLabelText('Units allocated to Alpine Capital Partners SAS (demo)'),
      { target: { value: '100' } },
    );
    expect(screen.getByLabelText('Justification (minimum amount not reached)')).toBeDefined();
  });

  it('lets another administrator validate, never the one who proposed (four eyes)', async () => {
    const proposed = round({
      status: 'PROPOSED',
      proposedBy: 'me',
      proposedByName: 'Admin One',
      proposedAt: '2026-09-26T09:00:00.000Z',
      failures: [],
    });
    api.GET.mockResolvedValue({ data: [proposed] });
    const { unmount } = renderWithIntl(
      withClient(<AllocationTab issuance={issuance} rights={rights} currentUserId="me" />),
    );
    expect(
      await screen.findByText(
        'You proposed this allocation: another Issuer Administrator must validate it.',
      ),
    ).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Validate the allocation' })).toBeNull();
    unmount();

    renderWithIntl(
      withClient(<AllocationTab issuance={issuance} rights={rights} currentUserId="other" />),
    );
    expect(await screen.findByRole('button', { name: 'Validate the allocation' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeDefined();
  });
});
