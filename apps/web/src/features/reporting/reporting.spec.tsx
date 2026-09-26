import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test/render';
import { TasksQueue } from './tasks-queue';

const api = vi.hoisted(() => ({ GET: vi.fn() }));
vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api,
}));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

function withClient(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

beforeEach(() => {
  api.GET.mockReset();
});

describe('"To do" queue', () => {
  it('links each task to the screen where it is decided', async () => {
    api.GET.mockResolvedValue({
      data: [
        {
          kind: 'DISTRIBUTION_TO_APPROVE',
          resourceType: 'distribution',
          resourceId: 'd-1',
          reference: 'NWGN',
          waitingSince: '2026-09-25T08:00:00.000Z',
          dueDate: '2026-09-15',
        },
        {
          kind: 'KYC_TO_DECIDE',
          resourceType: 'investor',
          resourceId: 'i-1',
          reference: 'Kestrel Treasury BV (demo)',
          waitingSince: '2026-09-24T08:00:00.000Z',
          dueDate: null,
        },
      ],
    });
    renderWithIntl(withClient(<TasksQueue />));
    const distribution = await screen.findByRole('link', { name: 'Distribution to approve' });
    expect(distribution.getAttribute('href')).toBe('/issuer/distributions/d-1');
    expect(screen.getByRole('link', { name: 'KYC/KYB case to decide' }).getAttribute('href')).toBe(
      '/issuer/investors/i-1',
    );
    expect(screen.getByText('Payment on 15 Sept 2026')).toBeDefined();
  });

  it('says so when nothing waits', async () => {
    api.GET.mockResolvedValue({ data: [] });
    renderWithIntl(withClient(<TasksQueue />));
    expect(await screen.findByText('Nothing waits for you.')).toBeDefined();
  });
});
