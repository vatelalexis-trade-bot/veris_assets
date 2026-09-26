import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test/render';
import { OpportunityDetail } from './opportunity-detail';

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

const ISSUANCE = '0192a000-0000-7000-8000-000000000010';
const SUBSCRIPTION = '0192a000-0000-7000-8000-000000000020';

const issuance = {
  id: ISSUANCE,
  name: 'Northwind Senior Debt 2026',
  code: 'NWSD26',
  status: 'SUBSCRIPTION_OPEN',
  assetCategory: null,
  currency: 'EUR',
  terms: {
    nominalValue: '1000.00',
    targetAmount: '5000000.00',
    interestRate: '0.05',
    distributionFrequency: null,
    subscriptionStartDate: '2026-09-01',
    subscriptionEndDate: '2026-11-30',
    maturityDate: '2031-12-01',
    minSubscriptionAmount: '100000.00',
    maxAmountPerInvestor: '2000000.00',
  },
};

function withClient(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

beforeEach(() => {
  api.GET.mockReset();
  api.POST.mockReset();
  api.PATCH.mockReset();
  push.mockReset();
  api.GET.mockImplementation(async (path: string) =>
    path === '/api/v1/issuances/{id}' ? { data: issuance } : { data: [] },
  );
});

async function fillForm(units: string) {
  fireEvent.change(await screen.findByLabelText('Number of units'), {
    target: { value: units },
  });
  fireEvent.click(screen.getByLabelText('I have read and accept the documents of the issuance.'));
  fireEvent.click(
    screen.getByLabelText('I declare that I meet the eligibility conditions of the issuance.'),
  );
}

describe('subscription form', () => {
  it('computes the amount exactly from the units, and refuses units that are not whole', async () => {
    renderWithIntl(withClient(<OpportunityDetail id={ISSUANCE} canSubscribe />));
    await fillForm('150');
    expect(screen.getByText('€150,000.00')).toBeDefined();
    fireEvent.change(screen.getByLabelText('Number of units'), { target: { value: '1.5' } });
    expect(screen.getByText('Enter a whole number of units, greater than zero.')).toBeDefined();
    expect(
      (screen.getByRole('button', { name: 'Submit the subscription' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it('creates the draft, submits it and opens the subscription', async () => {
    api.POST.mockImplementation(async (path: string) => ({
      data: {
        id: SUBSCRIPTION,
        version: 1,
        status: path.endsWith('submit') ? 'SUBMITTED' : 'DRAFT',
      },
    }));
    renderWithIntl(withClient(<OpportunityDetail id={ISSUANCE} canSubscribe />));
    await fillForm('150');
    fireEvent.click(screen.getByRole('button', { name: 'Submit the subscription' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/portal/subscriptions/${SUBSCRIPTION}`));
    expect(api.POST.mock.calls[0]![1].body).toMatchObject({
      issuanceId: ISSUANCE,
      requestedUnits: '150',
      requestedAmount: '150000.00',
    });
    expect(api.POST.mock.calls[1]![1].body).toEqual({
      documentsAccepted: true,
      eligibilityDeclared: true,
    });
  });

  it('explains an eligibility refusal in plain language, and updates the same draft next time', async () => {
    api.POST.mockImplementation(async (path: string) =>
      path.endsWith('submit')
        ? {
            error: {
              error: {
                code: 'ELIGIBILITY_FAILED',
                message: 'Not eligible',
                details: [
                  { code: 'KYC_EXPIRED', meta: { expiryDate: '2026-09-15', assessmentId: 'x' } },
                ],
              },
            },
          }
        : { data: { id: SUBSCRIPTION, version: 1, status: 'DRAFT' } },
    );
    api.PATCH.mockResolvedValue({ data: { id: SUBSCRIPTION, version: 2, status: 'DRAFT' } });
    renderWithIntl(withClient(<OpportunityDetail id={ISSUANCE} canSubscribe />));
    await fillForm('120');
    fireEvent.click(screen.getByRole('button', { name: 'Submit the subscription' }));
    expect(await screen.findByText('Your subscription was not sent.')).toBeDefined();
    expect(screen.getByRole('alert').textContent).toContain('2026-09-15');
    expect(screen.getByRole('alert').textContent).not.toContain('assessmentId');
    expect(push).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Submit the subscription' }));
    await waitFor(() => expect(api.PATCH).toHaveBeenCalledOnce());
    expect(api.PATCH.mock.calls[0]![1].headers).toEqual({ 'If-Match': '"1"' });
  });
});
