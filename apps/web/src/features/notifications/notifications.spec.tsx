import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl, type TestLocale } from '@/test/render';
import { NotificationBell } from './notification-bell';
import { NotificationPreferences } from './notification-preferences';

const api = vi.hoisted(() => ({ GET: vi.fn(), POST: vi.fn(), PUT: vi.fn() }));
vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api,
}));

const PREFERENCES = [
  { category: 'SECURITY', inApp: true, email: true, mandatory: true },
  { category: 'ORGANISATION', inApp: true, email: true, mandatory: false },
];

function renderUi(ui: ReactElement, locale: TestLocale = 'en-GB') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderWithIntl(<QueryClientProvider client={client}>{ui}</QueryClientProvider>, locale);
}

beforeEach(() => {
  api.GET.mockReset();
  api.POST.mockReset();
  api.PUT.mockReset();
  api.GET.mockImplementation(async (path: string) => {
    if (path === '/api/v1/notifications/unread-count') return { data: { count: 2 } };
    if (path === '/api/v1/notifications/preferences') return { data: PREFERENCES };
    return {
      data: {
        data: [
          {
            id: '0192a000-0000-7000-8000-000000000001',
            category: 'SECURITY',
            type: 'ROLES_CHANGED',
            params: {},
            resourceType: 'user',
            resourceId: null,
            readAt: null,
            createdAt: new Date().toISOString(),
          },
        ],
        meta: { page: 1, pageSize: 10, total: 1 },
      },
    };
  });
  api.POST.mockResolvedValue({ data: undefined });
  api.PUT.mockImplementation(async (_path: string, { body }: { body: unknown }) => ({
    data: body,
  }));
});

describe('NotificationBell', () => {
  it('announces the unread count and shows the texts of the catalogue in the user’s language', async () => {
    renderUi(<NotificationBell />, 'fr-FR');
    const bell = await screen.findByRole('button', { name: 'Notifications, 2 non lues' });
    fireEvent.click(bell);
    expect(await screen.findByText('Vos rôles ont changé')).toBeDefined();
    fireEvent.click(screen.getByText('Vos rôles ont changé'));
    await waitFor(() =>
      expect(api.POST).toHaveBeenCalledWith('/api/v1/notifications/{id}/read', {
        params: { path: { id: '0192a000-0000-7000-8000-000000000001' } },
      }),
    );
  });
});

describe('NotificationPreferences', () => {
  it('keeps mandatory categories on and saves only the others', async () => {
    renderUi(<NotificationPreferences open onOpenChange={() => undefined} />);
    const dialog = await screen.findByRole('dialog');
    const securityEmail = await within(dialog).findByRole('checkbox', {
      name: 'Security — By email',
    });
    expect((securityEmail as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Organisation — By email' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(api.PUT).toHaveBeenCalledWith('/api/v1/notifications/preferences', {
        body: { preferences: [{ category: 'ORGANISATION', inApp: true, email: false }] },
      }),
    );
  });
});
