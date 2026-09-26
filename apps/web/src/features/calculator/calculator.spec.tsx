import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithIntl } from '@/test/render';
import { Calculator } from './calculator';

describe('business case calculator (page)', () => {
  it('shows the estimate of the default figures, and updates it as the visitor types', () => {
    renderWithIntl(<Calculator />);
    expect(screen.getByText('€124,300', { selector: 'dd' })).toBeDefined();
    expect(screen.getByText('€21,580', { selector: 'dd' })).toBeDefined();
    expect(screen.getByText('7.5 months')).toBeDefined();

    fireEvent.change(screen.getByLabelText('Number of investors'), { target: { value: '80' } });
    // 60 + 12 + 4 × 80 = 392 operations × 2.5 h × 85 € + 75 000 € of other costs.
    expect(screen.getByText('€158,300', { selector: 'dd' })).toBeDefined();
  });

  it('explains what is missing instead of showing a wrong figure', () => {
    renderWithIntl(<Calculator />);
    fireEvent.change(screen.getByLabelText('Average hourly cost (€)'), {
      target: { value: 'abc' },
    });
    expect(screen.getByText('Enter a positive number.')).toBeDefined();
    expect(screen.getByText('Complete the highlighted fields to see the estimate.')).toBeDefined();
  });

  it('lets the visitor change the assumptions, shown as percentages', () => {
    renderWithIntl(<Calculator />);
    const saved = screen.getByLabelText('Manual time saved (%)') as HTMLInputElement;
    expect(saved.value).toBe('60');
    fireEvent.change(saved, { target: { value: '0' } });
    // No time saved: 29 580 € less gross savings.
    expect(screen.getByText('€28,500', { selector: 'dd' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Reset the figures' }));
    expect((screen.getByLabelText('Manual time saved (%)') as HTMLInputElement).value).toBe('60');
  });
});
