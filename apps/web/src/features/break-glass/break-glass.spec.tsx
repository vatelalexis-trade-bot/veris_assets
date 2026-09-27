import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test/render';
import { BreakGlassBanner } from './break-glass-banner';
import { BreakGlassForm } from './break-glass-form';

const api = vi.hoisted(() => ({ GET: vi.fn(), POST: vi.fn(), DELETE: vi.fn() }));
const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api,
}));
vi.mock('@/i18n/navigation', () => ({ useRouter: () => router }));

const TENANT = '0199a000-0000-7000-8000-00000000000a';

function withClient(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

beforeEach(() => {
  for (const mock of [api.GET, api.POST, api.DELETE, router.replace, router.refresh])
    mock.mockReset();
  api.GET.mockResolvedValue({
    data: {
      data: [
        { id: TENANT, legalName: 'Northwind Asset Management SAS (demo)', status: 'ACTIVE' },
        { id: 'other', legalName: 'Closed Ltd (demo)', status: 'INACTIVE' },
      ],
    },
  });
});

describe('emergency access', () => {
  it('asks for an active organisation and a reason, then opens the issuer portal', async () => {
    renderWithIntl(withClient(<BreakGlassForm />));
    await screen.findByRole('option', { name: 'Northwind Asset Management SAS (demo)' });
    expect(screen.queryByRole('option', { name: 'Closed Ltd (demo)' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open the emergency access' }));
    expect(screen.getByText('Give a reason of at least 10 characters.')).toBeDefined();
    expect(api.POST).not.toHaveBeenCalled();

    api.POST.mockResolvedValue({ data: { id: 'g-1' } });
    fireEvent.change(screen.getByLabelText('Organisation'), { target: { value: TENANT } });
    fireEvent.change(screen.getByLabelText('Reason'), {
      target: { value: 'Support ticket 42 (demo)' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Open the emergency access' }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/issuer/dashboard'));
    expect(api.POST.mock.calls[0]![1].body).toEqual({ reason: 'Support ticket 42 (demo)' });
  });

  it('shows the access in progress and ends it', async () => {
    api.DELETE.mockResolvedValue({});
    renderWithIntl(
      <BreakGlassBanner tenantName="Northwind (demo)" expiresAt="2026-09-27T20:00:00.000Z" />,
    );
    expect(screen.getByRole('alert').textContent).toContain(
      'Emergency read-only access to Northwind (demo)',
    );
    fireEvent.click(screen.getByRole('button', { name: 'End the access' }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/platform/break-glass'));
    expect(api.DELETE).toHaveBeenCalledWith('/api/v1/break-glass');
  });
});
