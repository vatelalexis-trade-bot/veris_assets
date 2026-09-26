/**
 * Business dates (docs/ARCHITECTURE.md §4.7): plain `YYYY-MM-DD` strings, without time or time
 * zone. "Today" is the calendar day in the tenant's time zone (decision D-015).
 */
export type BusinessDate = string;

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Calendar day of an instant in a time zone, e.g. `2026-09-25` in `Europe/Paris`. */
export function dateInTimeZone(instant: Date, timeZone: string): BusinessDate {
  // The Swedish format is exactly YYYY-MM-DD.
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

function parts(date: BusinessDate): [number, number, number] {
  const match = DATE.exec(date);
  if (!match) throw new Error(`Not a business date: ${date}`);
  // Calendar integers, not amounts.
  const toInt = (text: string | undefined) => Number.parseInt(text!, 10);
  return [toInt(match[1]), toInt(match[2]), toInt(match[3])];
}

function format(utc: Date): BusinessDate {
  return utc.toISOString().slice(0, 10);
}

export function addDays(date: BusinessDate, days: number): BusinessDate {
  const [year, month, day] = parts(date);
  return format(new Date(Date.UTC(year, month - 1, day + days)));
}

/**
 * Same day `months` later; when that day does not exist, the last day of the month
 * (31 January + 1 month = 28 or 29 February).
 */
export function addMonths(date: BusinessDate, months: number): BusinessDate {
  const [year, month, day] = parts(date);
  const lastDay = new Date(Date.UTC(year, month - 1 + months + 1, 0)).getUTCDate();
  return format(new Date(Date.UTC(year, month - 1 + months, day < lastDay ? day : lastDay)));
}

/** Saturday or Sunday (the MVP has no holiday calendar, SPEC §12.2). */
export function isWeekend(date: BusinessDate): boolean {
  const [year, month, day] = parts(date);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday === 0 || weekday === 6;
}

/** The date itself, or the next business day when it falls on a weekend ("following"). */
export function followingBusinessDay(date: BusinessDate): BusinessDate {
  let current = date;
  while (isWeekend(current)) current = addDays(current, 1);
  return current;
}

/** `count` business days (Monday–Friday) before a date (decision D-012). */
export function subtractBusinessDays(date: BusinessDate, count: number): BusinessDate {
  let current = date;
  let left = count;
  while (left > 0) {
    current = addDays(current, -1);
    if (!isWeekend(current)) left -= 1;
  }
  return current;
}

/** Calendar days from `start` to `end` (negative when `end` is before `start`). */
export function daysBetween(start: BusinessDate, end: BusinessDate): number {
  const [y1, m1, d1] = parts(start);
  const [y2, m2, d2] = parts(end);
  // Whole days in UTC (no daylight saving time): the division is always exact.
  return (Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000;
}

/** Year, month and day of a business date, for day count conventions. */
export function dateParts(date: BusinessDate): [number, number, number] {
  return parts(date);
}
