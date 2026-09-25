import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Input } from '@/components/ui/input';
import { renderWithIntl } from '@/test/render';
import { DataTable } from './data-table';
import { DemoBanner } from './demo-banner';
import { ErrorState } from './error-state';
import { FormField } from './form-field';
import { StatusBadge } from './status-badge';

describe('StatusBadge', () => {
  it('shows the translated status with its tone', () => {
    renderWithIntl(<StatusBadge domain="subscription" status="PAYMENT_PENDING" />, 'fr-FR');
    const badge = screen.getByText('Paiement en attente');
    expect(badge.dataset.tone).toBe('warning');
  });
});

describe('DemoBanner', () => {
  it('is present in both languages (SPEC §3.3)', () => {
    renderWithIntl(<DemoBanner />, 'en-GB');
    expect(screen.getByRole('note').textContent).toBe(
      'Demonstration environment — fictitious data',
    );
  });
});

describe('ErrorState', () => {
  it('translates the error code and shows the correlation ID for support', () => {
    renderWithIntl(
      <ErrorState code="SUBSCRIPTION_LIMIT_EXCEEDED" correlationId="0192-abc" />,
      'fr-FR',
    );
    expect(screen.getByRole('alert').textContent).toContain(
      'La souscription demandée dépasse la limite autorisée.',
    );
    expect(screen.getByText('Référence pour le support : 0192-abc')).toBeDefined();
  });

  it('falls back to a generic message for an unknown code', () => {
    renderWithIntl(<ErrorState code="SOMETHING_NEW" />);
    expect(screen.getByRole('alert').textContent).toContain('An unexpected error occurred.');
  });
});

describe('FormField', () => {
  it('links the label, the control and the error message', () => {
    renderWithIntl(
      <FormField label="Nominal value" error="Required">
        <Input />
      </FormField>,
    );
    const input = screen.getByLabelText('Nominal value');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const describedBy = input.getAttribute('aria-describedby') ?? '';
    expect(document.getElementById(describedBy)?.textContent).toBe('Required');
  });
});

describe('DataTable', () => {
  const columns = [
    {
      id: 'name',
      header: 'Name',
      cell: (row: { id: string; name: string; amount: string }) => row.name,
      sortable: true,
    },
    {
      id: 'amount',
      header: 'Amount',
      cell: (row: { id: string; name: string; amount: string }) => row.amount,
      numeric: true,
    },
  ];
  const rows = [
    { id: '1', name: 'Helios Solar SPV 2027', amount: '2,500.00' },
    { id: '2', name: 'Northwind Private Debt Fund I', amount: '10,000.00' },
  ];

  it('renders the rows with an accessible caption', () => {
    renderWithIntl(
      <DataTable caption="Issuances" columns={columns} rows={rows} getRowId={(row) => row.id} />,
    );
    expect(screen.getByRole('table', { name: 'Issuances' })).toBeDefined();
    expect(screen.getAllByRole('row')).toHaveLength(3);
  });

  it('shows the empty message when there is no row', () => {
    renderWithIntl(
      <DataTable caption="Issuances" columns={columns} rows={[]} getRowId={(row) => row.id} />,
      'fr-FR',
    );
    expect(screen.getByText('Aucune donnée à afficher.')).toBeDefined();
  });

  it('reports sorting and page changes to its parent (server-side sorting and pagination)', () => {
    const onSortChange = vi.fn();
    const onPageChange = vi.fn();
    renderWithIntl(
      <DataTable
        caption="Issuances"
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        sort={{ columnId: 'name', direction: 'asc' }}
        onSortChange={onSortChange}
        pagination={{ page: 1, pageSize: 2, total: 5 }}
        onPageChange={onPageChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Sort by Name' }));
    expect(onSortChange).toHaveBeenCalledWith({ columnId: 'name', direction: 'desc' });
    expect(screen.getByText('Page 1 of 3')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Previous page' }).hasAttribute('disabled')).toBe(
      true,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });
});
