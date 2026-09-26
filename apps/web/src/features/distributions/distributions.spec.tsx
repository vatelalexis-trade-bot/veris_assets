import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test/render';
import { DistributionDetail, type DistributionRights } from './distribution-detail';
import type { DistributionView } from './types';

const api = vi.hoisted(() => ({ GET: vi.fn(), POST: vi.fn() }));
vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api,
}));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ children }: { children: ReactNode }) => children,
}));

const ID = '0192a000-0000-7000-8000-000000000080';

function view(changes: Partial<DistributionView> = {}): DistributionView {
  return {
    id: ID,
    issuanceId: '0192a000-0000-7000-8000-000000000081',
    issuanceName: 'Northwind Green Notes',
    issuanceCode: 'NWGN',
    type: 'COUPON',
    status: 'UNDER_REVIEW',
    schedule: {
      id: '0192a000-0000-7000-8000-000000000082',
      sequence: 1,
      periodStart: '2026-03-15',
      periodEnd: '2026-09-15',
      paymentDate: '2026-09-15',
      recordDate: '2026-09-14',
    },
    dayCount: '30E_360',
    periodFraction: '0.5',
    rate: '0.05',
    nominalValue: '1000.00',
    currency: 'EUR',
    roundingMethod: 'HALF_EVEN',
    totalGrossAmount: '12500.00',
    totalUnroundedAmount: '12500',
    roundingDifference: '0',
    beneficiaryCount: 3,
    calculationVersion: 'servicing-calc-1',
    calculatedAt: '2026-09-26T08:00:00.000Z',
    snapshotId: '0192a000-0000-7000-8000-000000000083',
    preparedBy: 'operator',
    approvedBy: null,
    approvedAt: null,
    statusComment: null,
    instruction: null,
    version: 3,
    ...changes,
  };
}

const staff: DistributionRights = {
  investor: false,
  canPrepare: true,
  canApprove: true,
  canCancel: true,
  canConfirmPayment: true,
  currentUserId: 'admin-1',
};

function withClient(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

function answer(distribution: DistributionView) {
  api.GET.mockImplementation(async (path: string) =>
    path.endsWith('/lines')
      ? {
          data: [
            {
              investorId: '0192a000-0000-7000-8000-000000000084',
              investorName: 'Alpine Capital Partners SAS (demo)',
              eligibleQuantity: '100',
              grossAmountUnrounded: '2500',
              grossAmount: '2500.00',
              currency: 'EUR',
              anomalyCode: null,
            },
          ],
        }
      : path.endsWith('/transitions')
        ? { data: [] }
        : { data: distribution },
  );
}

beforeEach(() => {
  api.GET.mockReset();
});

describe('distribution page', () => {
  it('shows the calculation and the line of 2 500.00 € (scenario 6)', async () => {
    answer(view());
    renderWithIntl(withClient(<DistributionDetail id={ID} rights={staff} />));
    expect(await screen.findByText('€2,500.00')).toBeDefined();
    expect(screen.getByText('€12,500.00')).toBeDefined();
    expect(screen.getByText('0.5')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDefined();
  });

  it('never lets the one who submitted it approve it (four eyes)', async () => {
    answer(view({ preparedBy: 'admin-1' }));
    renderWithIntl(withClient(<DistributionDetail id={ID} rights={staff} />));
    expect(
      await screen.findByText(
        'You submitted this distribution: another Issuer Administrator must approve it.',
      ),
    ).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
  });

  it('shows the investor its line without the actions nor the calculation details', async () => {
    answer(view({ status: 'PAID' }));
    renderWithIntl(
      withClient(
        <DistributionDetail id={ID} rights={{ ...staff, investor: true, canPrepare: false }} />,
      ),
    );
    expect(await screen.findByText('Your line')).toBeDefined();
    expect(screen.queryByText('Period fraction')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cancel the distribution' })).toBeNull();
  });
});
