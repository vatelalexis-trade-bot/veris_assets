import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test/render';
import { ApiError } from './api-error';
import { ResetPasswordForm } from './password-forms';

// The forms only need a router for redirections, which these tests do not reach.
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  Link: ({ children }: { children: ReactElement }) => children,
}));

function withQueryClient(ui: ReactElement) {
  return <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>;
}

describe('ApiError', () => {
  it('lists the refused password rules in plain language', () => {
    const error = {
      error: {
        code: 'PASSWORD_TOO_WEAK',
        message: 'The password does not meet the requirements.',
        details: [{ code: 'PASSWORD_TOO_COMMON', field: 'password' }],
        correlationId: '0192-abc',
        timestamp: '2026-09-25T10:00:00Z',
      },
    };
    renderWithIntl(<ApiError error={error} />, 'fr-FR');
    expect(
      screen.getByText('Ce mot de passe est trop courant. Choisissez-en un autre.'),
    ).toBeDefined();
    // Expected user errors do not show a support reference.
    expect(screen.queryByText(/0192-abc/)).toBeNull();
  });

  it('shows the support reference for unexpected errors', () => {
    renderWithIntl(
      <ApiError
        error={{ error: { code: 'INTERNAL_ERROR', details: [], correlationId: 'ref-42' } }}
      />,
    );
    expect(screen.getByText('Reference for support: ref-42')).toBeDefined();
  });
});

describe('ResetPasswordForm', () => {
  it('flags different passwords and keeps the button disabled', () => {
    renderWithIntl(withQueryClient(<ResetPasswordForm token="token" />));
    fireEvent.change(screen.getByLabelText('New password'), {
      target: { value: 'violet tractor under the moon' },
    });
    fireEvent.change(screen.getByLabelText('Confirm the password'), {
      target: { value: 'something else entirely' },
    });
    expect(screen.getByText('The two passwords are different.')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Save the password' }).hasAttribute('disabled')).toBe(
      true,
    );
  });
});
