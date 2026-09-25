import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test/render';
import { UsersPanel } from './users-panel';

const api = vi.hoisted(() => ({ GET: vi.fn(), POST: vi.fn(), PUT: vi.fn() }));
vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api,
}));

const SELF = '0192a000-0000-7000-8000-000000000001';
const OTHER = '0192a000-0000-7000-8000-000000000002';
const user = (id: string, name: string, roles: string[]) => ({
  id,
  name,
  email: `${name.toLowerCase()}@example.test`,
  locale: 'en-GB',
  status: 'ACTIVE',
  roles,
  mfaEnabled: true,
  lastLoginAt: null,
  createdAt: '2026-09-01T10:00:00Z',
});

function renderPanel(rights: { canManage: boolean; canAssignRoles: boolean }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui: ReactElement = (
    <QueryClientProvider client={client}>
      <UsersPanel currentUserId={SELF} rights={rights} />
    </QueryClientProvider>
  );
  return renderWithIntl(ui);
}

beforeEach(() => {
  api.GET.mockImplementation(async (path: string) =>
    path === '/api/v1/users'
      ? {
          data: [
            user(SELF, 'Alice', ['ISSUER_ADMIN']),
            user(OTHER, 'Bob', ['ISSUER_OPERATOR', 'AUDITOR']),
          ],
        }
      : { data: [] },
  );
  api.POST.mockResolvedValue({ data: undefined });
});

describe('UsersPanel', () => {
  it('shows translated roles and no action on the signed-in user', async () => {
    renderPanel({ canManage: true, canAssignRoles: true });
    const bobRow = (await screen.findByText('Bob')).closest('tr')!;
    expect(within(bobRow).getByText('Issuer operator, Auditor')).toBeDefined();
    expect(within(bobRow).getByRole('button', { name: 'Deactivate' })).toBeDefined();
    const aliceRow = screen.getByText('Alice').closest('tr')!;
    expect(within(aliceRow).queryByRole('button')).toBeNull();
  });

  it('hides management actions and the invitation form without the permissions', async () => {
    renderPanel({ canManage: false, canAssignRoles: false });
    await screen.findByText('Bob');
    expect(screen.queryByRole('button', { name: 'Deactivate' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Roles' })).toBeNull();
    expect(screen.queryByText('Invite a user')).toBeNull();
  });

  it('deactivates a user only after confirmation', async () => {
    renderPanel({ canManage: true, canAssignRoles: false });
    fireEvent.click(await screen.findByRole('button', { name: 'Deactivate' }));
    expect(api.POST).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Deactivate' }));
    await waitFor(() =>
      expect(api.POST).toHaveBeenCalledWith('/api/v1/users/{id}/deactivate', {
        params: { path: { id: OTHER } },
      }),
    );
  });
});
