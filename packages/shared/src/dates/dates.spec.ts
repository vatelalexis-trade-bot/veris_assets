import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  dateInTimeZone,
  dateParts,
  daysBetween,
  followingBusinessDay,
  isWeekend,
  subtractBusinessDays,
} from './dates.js';

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

describe('business days (SPEC §12.2, D-012)', () => {
  it('moves a weekend payment to the next Monday, and keeps a weekday', () => {
    expect(isWeekend('2026-09-26')).toBe(true);
    expect(followingBusinessDay('2026-09-26')).toBe('2026-09-28');
    expect(followingBusinessDay('2026-09-28')).toBe('2026-09-28');
  });

  it('counts business days backwards over a weekend', () => {
    expect(subtractBusinessDays('2026-09-28', 1)).toBe('2026-09-25');
    expect(subtractBusinessDays('2026-09-30', 2)).toBe('2026-09-28');
    expect(subtractBusinessDays('2026-09-30', 0)).toBe('2026-09-30');
  });

  it('counts calendar days, across a leap day', () => {
    expect(daysBetween('2028-02-01', '2028-03-01')).toBe(29);
    expect(daysBetween('2026-03-26', '2026-09-26')).toBe(184);
    expect(dateParts('2026-09-26')).toEqual([2026, 9, 26]);
  });
});
