import { describe, expect, it } from 'vitest';
import { subscriptionAmount } from './amount';

describe('subscriptionAmount', () => {
  it('multiplies units by the nominal value in exact decimals', () => {
    expect(subscriptionAmount('150', '1000.00', 'EUR')).toBe('150000.00');
    expect(subscriptionAmount('3', '0.10', 'EUR')).toBe('0.30');
    // Beyond the precision of a float, the result stays exact.
    expect(subscriptionAmount('99999999999', '1000.01', 'USD')).toBe('100000999998999.99');
  });

  it('gives nothing for units that are not a whole positive number', () => {
    for (const units of ['', '0', '000', '1.5', '-2', 'ten', '1e3'])
      expect(subscriptionAmount(units, '1000.00', 'EUR'), units).toBeNull();
    expect(subscriptionAmount('10', null, 'EUR')).toBeNull();
  });
});
