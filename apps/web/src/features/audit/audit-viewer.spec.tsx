import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test/render';
import { AuditViewer } from './audit-viewer';

const api = vi.hoisted(() => ({ GET: vi.fn() }));
vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api,
}));

const ENTRY = {
  id: '0192a000-0000-7000-8000-00000000000a',
  occurredAt: '2026-09-25T10:00:00.000Z',
  actorUserId: '0192a000-0000-7000-8000-000000000001',
  actorName: 'Alice Martin (demo)',
  actorRole: 'ISSUER_ADMIN',
  action: 'USER_ROLES_CHANGED',
  resourceType: 'user',
  resourceId: '0192a000-0000-7000-8000-000000000002',
  result: 'SUCCESS',
  reason: null,
  source: 'WEB',
  correlationId: '0192a000-0000-7000-8000-0000000000cc',
};

function renderViewer() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderWithIntl(
    <QueryClientProvider client={client}>
      <AuditViewer />
    </QueryClientProvider>,
    'fr-FR',
  );
}

beforeEach(() => {
  api.GET.mockReset();
  api.GET.mockImplementation(async (path: string) => {
    if (path === '/api/v1/audit-events/actions')
      return { data: ['USER_ROLES_CHANGED', 'NEW_ACTION'] };
    if (path === '/api/v1/audit-events/{id}') {
      return {
        data: {
          ...ENTRY,
          oldValue: { roles: ['AUDITOR'] },
          newValue: { roles: ['AUDITOR', 'COMPLIANCE_OFFICER'] },
          ipAddress: '127.0.0.1',
          userAgent: 'Test browser',
        },
      };
    }
    return { data: { data: [ENTRY], meta: { page: 1, pageSize: 25, total: 1 } } };
  });
});

describe('AuditViewer', () => {
  it('shows entries in plain language, with the author and the result', async () => {
    renderViewer();
    const row = (await screen.findByText('Alice Martin (demo)')).closest('tr')!;
    // Columns: date, user, action, resource, result, details.
    expect(within(row).getAllByRole('cell')[2]!.textContent).toBe('Rôles modifiés');
    expect(within(row).getByText('Réussie')).toBeDefined();
    // An action without translation stays readable as its code.
    expect(await screen.findByRole('option', { name: 'NEW_ACTION' })).toBeDefined();
  });

  it('sends the filters to the API, with the period in UTC', async () => {
    renderViewer();
    await screen.findByText('Alice Martin (demo)');
    fireEvent.change(screen.getByLabelText('Action'), { target: { value: 'USER_ROLES_CHANGED' } });
    fireEvent.change(screen.getByLabelText('Résultat'), { target: { value: 'DENIED' } });
    fireEvent.change(screen.getByLabelText('Du'), { target: { value: '2026-09-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Filtrer' }));
    await waitFor(() =>
      expect(api.GET).toHaveBeenCalledWith('/api/v1/audit-events', {
        params: {
          query: {
            page: 1,
            pageSize: 25,
            action: 'USER_ROLES_CHANGED',
            result: 'DENIED',
            from: new Date('2026-09-01T00:00:00').toISOString(),
          },
        },
      }),
    );
  });

  it('shows the values before and after the change', async () => {
    renderViewer();
    fireEvent.click(await screen.findByRole('button', { name: /Détail/ }));
    const dialog = await screen.findByRole('dialog');
    const row = (await within(dialog).findByText('roles')).closest('tr')!;
    expect(within(row).getByText('["AUDITOR"]')).toBeDefined();
    expect(within(row).getByText('["AUDITOR","COMPLIANCE_OFFICER"]')).toBeDefined();
  });
});
