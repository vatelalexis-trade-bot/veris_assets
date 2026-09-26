import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test/render';
import { PaymentPanel } from './payment-panel';
import type { SubscriptionView } from './types';

const api = vi.hoisted(() => ({ GET: vi.fn(), POST: vi.fn() }));
vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api,
}));

const subscription = {
  id: '0192a000-0000-7000-8000-000000000061',
  status: 'PAYMENT_PENDING',
  currency: 'EUR',
  amountDue: '400000.00',
  allocatedUnits: '400',
} as SubscriptionView;

function withClient(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

const staff = { canPrepare: true, canConfirm: true, currentUserId: 'admin-1' };

beforeEach(() => {
  api.GET.mockReset();
});

describe('payment panel', () => {
  it('offers to prepare the payment of the amount due', async () => {
    api.GET.mockResolvedValue({ data: null });
    renderWithIntl(withClient(<PaymentPanel subscription={subscription} rights={staff} />));
    expect(await screen.findByText('Waiting for the payment of €400,000.00.')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Prepare the payment confirmation' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Confirm the payment' })).toBeNull();
  });

  it('lets another administrator confirm, never the preparer (four eyes)', async () => {
    const prepared = {
      id: '0192a000-0000-7000-8000-000000000062',
      subscriptionId: subscription.id,
      amount: '400000.00',
      currency: 'EUR',
      status: 'PREPARED',
      preparedBy: 'admin-1',
      preparedAt: '2026-09-26T09:00:00.000Z',
      confirmedBy: null,
      confirmedAt: null,
      providerReference: 'FAKE-PAY-0123456789AB',
    };
    api.GET.mockResolvedValue({ data: prepared });
    const { unmount } = renderWithIntl(
      withClient(<PaymentPanel subscription={subscription} rights={staff} />),
    );
    expect(
      await screen.findByText(
        'You prepared this payment: another Issuer Administrator must confirm it.',
      ),
    ).toBeDefined();
    expect(screen.getByText('FAKE-PAY-0123456789AB')).toBeDefined();
    unmount();
    renderWithIntl(
      withClient(
        <PaymentPanel
          subscription={subscription}
          rights={{ ...staff, currentUserId: 'admin-2' }}
        />,
      ),
    );
    expect(await screen.findByRole('button', { name: 'Confirm the payment' })).toBeDefined();
  });

  it('only shows the status to the investor', async () => {
    api.GET.mockResolvedValue({ data: null });
    renderWithIntl(withClient(<PaymentPanel subscription={subscription} rights={null} />));
    expect(
      await screen.findByText(
        'No real payment is made in this demonstration: the payment is simulated.',
      ),
    ).toBeDefined();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
