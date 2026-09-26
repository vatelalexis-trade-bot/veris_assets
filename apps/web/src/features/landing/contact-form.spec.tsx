import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test/render';
import { ContactForm } from './contact-form';

const api = vi.hoisted(() => ({ POST: vi.fn() }));
vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api,
}));

function withClient(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

beforeEach(() => {
  api.POST.mockReset();
});

describe('contact form', () => {
  it('sends nothing until the form is complete', () => {
    renderWithIntl(withClient(<ContactForm />));
    fireEvent.click(screen.getByRole('button', { name: 'Send the message' }));
    expect(screen.getByText('Enter your name.')).toBeDefined();
    expect(screen.getByText('Please agree to be contacted.')).toBeDefined();
    expect(api.POST).not.toHaveBeenCalled();
  });

  it('sends the message once complete, and thanks the visitor', async () => {
    api.POST.mockResolvedValue({ data: undefined, error: undefined });
    renderWithIntl(withClient(<ContactForm />));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: ' Claire Martin ' } });
    fireEvent.change(screen.getByLabelText('Work email'), {
      target: { value: 'claire@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Message'), {
      target: { value: 'We would like a demonstration.' },
    });
    fireEvent.click(screen.getByLabelText('I agree to be contacted about this request.'));
    fireEvent.click(screen.getByRole('button', { name: 'Send the message' }));
    expect(await screen.findByRole('status')).toBeDefined();
    const [path, options] = api.POST.mock.calls[0]!;
    expect(path).toBe('/api/v1/public/contact');
    expect(options.body).toEqual({
      name: 'Claire Martin',
      email: 'claire@example.com',
      message: 'We would like a demonstration.',
      consent: true,
      locale: 'en-GB',
    });
  });

  it('shows the error when the message cannot be sent', async () => {
    api.POST.mockResolvedValue({
      error: { error: { code: 'RATE_LIMITED', message: 'x', details: [] } },
    });
    renderWithIntl(withClient(<ContactForm />));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Claire' } });
    fireEvent.change(screen.getByLabelText('Work email'), {
      target: { value: 'claire@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Message'), {
      target: { value: 'A long enough message.' },
    });
    fireEvent.click(screen.getByLabelText('I agree to be contacted about this request.'));
    fireEvent.click(screen.getByRole('button', { name: 'Send the message' }));
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
    expect(await screen.findByRole('alert')).toBeDefined();
  });
});
