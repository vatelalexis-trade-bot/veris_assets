import { describe, expect, it } from 'vitest';
import { addDays, addMonths, dateInTimeZone } from './dates.js';

describe('business dates', () => {
  it('gives the calendar day in the tenant’s time zone', () => {
    const lateEvening = new Date('2026-09-25T22:30:00Z');
    expect(dateInTimeZone(lateEvening, 'UTC')).toBe('2026-09-25');
    expect(dateInTimeZone(lateEvening, 'Europe/Paris')).toBe('2026-09-26');
    expect(dateInTimeZone(lateEvening, 'America/New_York')).toBe('2026-09-25');
  });

  it('adds days across months and years', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('adds months, keeping the last day of shorter months', () => {
    expect(addMonths('2026-09-25', 12)).toBe('2027-09-25');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-12-15', 2)).toBe('2027-02-15');
  });

  it('refuses a value that is not a date', () => {
    expect(() => addDays('25/09/2026', 1)).toThrow(/Not a business date/);
  });
});
