import { describe, expect, it } from 'vitest';
import {
  formatAmount,
  formatBusinessDate,
  formatRate,
  fractionToPercent,
  percentToFraction,
} from './format';

describe('issuance formatting', () => {
  it('formats amounts from their exact decimal string', () => {
    expect(formatAmount('5000000.00', 'EUR', 'en-GB')).toBe('€5,000,000.00');
    expect(formatAmount('12345678901234567.89', 'EUR', 'en-GB')).toBe('€12,345,678,901,234,567.89');
    expect(formatAmount(null, 'EUR', 'en-GB')).toBe('—');
  });

  it('shows rates stored as fractions as percentages, exactly', () => {
    expect(formatRate('0.05', 'en-GB')).toBe('5 %');
    expect(formatRate('0.0525', 'en-GB')).toBe('5.25 %');
    expect(formatRate('0.123456', 'fr-FR')).toBe('12,3456 %');
    expect(formatRate('1', 'en-GB')).toBe('100 %');
    expect(formatRate('-0.01', 'en-GB')).toBe('-1 %');
  });

  it('converts between percentages typed by the user and stored fractions', () => {
    expect(fractionToPercent('0.0525')).toBe('5.25');
    expect(percentToFraction('5,25')).toBe('0.0525');
    expect(percentToFraction('5')).toBe('0.05');
    expect(percentToFraction('five')).toBeNull();
  });

  it('shows business dates on the same day whatever the time zone', () => {
    expect(formatBusinessDate('2027-01-15', 'en-GB')).toBe('15 Jan 2027');
  });
});
