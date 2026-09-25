import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test/render';
import { EligibilityPanel } from './eligibility-panel';
import { EligibilityResult } from './eligibility-result';

const api = vi.hoisted(() => ({ GET: vi.fn(), POST: vi.fn() }));
vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api,
}));

const INVESTOR = '0192a000-0000-7000-8000-000000000001';

function withClient(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

beforeEach(() => {
  api.GET.mockReset();
  api.POST.mockReset();
  api.GET.mockImplementation(async (path: string) =>
    path === '/api/v1/reference/countries'
      ? { data: [{ code: 'US', nameEn: 'United States', nameFr: 'États-Unis' }] }
      : { data: { data: [], meta: { page: 1, pageSize: 20, total: 0 } } },
  );
});

describe('EligibilityResult', () => {
  it('explains the failed rules first, in plain language, with their values', () => {
    renderWithIntl(
      <EligibilityResult
        result="NOT_ELIGIBLE"
        rules={[
          { code: 'PROFILE_INACTIVE', passed: true, detail: { profileStatus: 'ACTIVE' } },
          { code: 'KYC_EXPIRED', passed: false, detail: { expiryDate: '2026-09-01' } },
          { code: 'COUNTRY_EXCLUDED', passed: false, detail: { country: 'US' } },
        ]}
      />,
      'fr-FR',
    );
    expect(screen.getByText('Non éligible : 2 règles ne sont pas respectées.')).toBeDefined();
    const items = screen.getAllByRole('listitem').map((item) => item.textContent);
    expect(items[0]).toContain('Le contrôle KYC/KYB a expiré');
    expect(items[0]).toContain('KYC/KYB valable jusqu’au 2026-09-01');
    expect(items[1]).toContain('Pays : US');
    expect(items[2]).toContain('Le profil de l’investisseur est actif.');
    // Coded values are translated.
    expect(items[2]).toContain('Profil : Actif');
  });

  it('says so when every rule is met', () => {
    renderWithIntl(
      <EligibilityResult result="ELIGIBLE" rules={[{ code: 'COUNTRY_EXCLUDED', passed: true }]} />,
    );
    expect(screen.getByText('Eligible: every rule is met.')).toBeDefined();
  });
});

describe('EligibilityPanel', () => {
  it('requires a justification for the Compliance Officer’s decision', async () => {
    api.POST.mockResolvedValue({ data: { id: INVESTOR, eligibilityStatus: 'SUSPENDED' } });
    renderWithIntl(
      withClient(
        <EligibilityPanel
          investorId={INVESTOR}
          status="ELIGIBLE"
          rights={{ canRead: true, canDecide: true }}
        />,
      ),
    );
    const submit = screen.getByRole('button', { name: 'Record the decision' });
    expect(submit.hasAttribute('disabled')).toBe(true);
    fireEvent.change(screen.getByLabelText('New status'), { target: { value: 'SUSPENDED' } });
    fireEvent.change(screen.getByLabelText('Justification (required)'), {
      target: { value: 'Adverse media' },
    });
    fireEvent.click(submit);
    await waitFor(() =>
      expect(api.POST).toHaveBeenCalledWith('/api/v1/investors/{id}/eligibility-status', {
        params: { path: { id: INVESTOR }, header: { 'Idempotency-Key': expect.any(String) } },
        body: { status: 'SUSPENDED', justification: 'Adverse media' },
      }),
    );
  });

  it('simulates the rules of an issuance and shows the result', async () => {
    api.POST.mockResolvedValue({
      data: {
        result: 'NOT_ELIGIBLE',
        rules: [{ code: 'COUNTRY_EXCLUDED', passed: false, detail: { country: 'US' } }],
        rulesVersion: 'engine-1/rules-0',
      },
    });
    renderWithIntl(
      withClient(
        <EligibilityPanel
          investorId={INVESTOR}
          status="NOT_ASSESSED"
          rights={{ canRead: true, canDecide: false }}
        />,
      ),
    );
    const countries = await screen.findByLabelText('Excluded countries');
    await screen.findAllByRole('option', { name: 'United States' });
    const option = (countries as HTMLSelectElement).options[0]!;
    option.selected = true;
    fireEvent.change(countries);
    fireEvent.change(screen.getByLabelText('KYC/KYB still valid after (days)'), {
      target: { value: '90' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(
      await screen.findByText('The investor’s country is excluded from this issuance.'),
    ).toBeDefined();
    expect(api.POST).toHaveBeenCalledWith('/api/v1/eligibility-assessments/preview', {
      body: {
        investorId: INVESTOR,
        ruleSet: expect.objectContaining({
          excludedCountries: ['US'],
          kycMinRemainingValidityDays: 90,
          kycRequired: true,
        }),
      },
    });
  });
});
