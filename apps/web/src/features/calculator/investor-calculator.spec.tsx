import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithIntl } from '@/test/render';
import { InvestorCalculator } from './investor-calculator';

describe('investor coupon simulator (page)', () => {
  it('shows the coupons of the default figures and follows the frequency chosen', () => {
    renderWithIntl(<InvestorCalculator />);
    expect(screen.getByText('€2,750.00', { selector: 'dd' })).toBeDefined();
    expect(screen.getByText('€127,500.00', { selector: 'dd' })).toBeDefined();
    const schedule = screen.getByRole('table', { name: 'Payment schedule' });
    expect(within(schedule).getAllByRole('row')).toHaveLength(11);
    expect(within(schedule).getByRole('row', { name: /No\. 10 · month 60/ }).textContent).toContain(
      '€100,000.00',
    );

    fireEvent.change(screen.getByLabelText('Coupon frequency'), { target: { value: '4' } });
    expect(screen.getByText('€1,375.00', { selector: 'dd' })).toBeDefined();
    expect(screen.getByText('20', { selector: 'dd' })).toBeDefined();
  });

  it('explains an invalid figure, and says the simulation is only an illustration', () => {
    renderWithIntl(<InvestorCalculator />, 'fr-FR');
    fireEvent.change(screen.getByLabelText('Durée (années)'), { target: { value: '40' } });
    expect(screen.getByText('Saisissez un nombre entier d’années, de 1 à 30.')).toBeDefined();
    expect(
      screen.getByText('Complétez les champs signalés pour voir la simulation.'),
    ).toBeDefined();
    expect(
      screen.getByText(/Simulation illustrative, avant fiscalité, non garantie/),
    ).toBeDefined();
  });
});
