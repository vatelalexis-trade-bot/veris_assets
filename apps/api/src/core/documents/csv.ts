// CSV of the exports (P15-3): UTF-8 with a byte order mark so that spreadsheets read the accents,
// comma separated, one header row, and the demonstration mention on the first line.

export type CsvCell = string | number | Date | null | undefined;

/** Byte order mark, written as a code so that no formatter turns it into an invisible character. */
const BOM = String.fromCharCode(0xfeff);
/** A number, possibly negative or decimal: never taken for a formula. */
const NUMBER = /^-?\d+(\.\d+)?$/;

/**
 * One cell: dates in ISO 8601 UTC, empty for no value. A text starting with =, +, - or @ is
 * prefixed with an apostrophe so that a spreadsheet never runs it as a formula (CSV injection).
 */
export function csvCell(value: CsvCell): string {
  if (value === null || value === undefined) return '';
  let text = value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(text) && !NUMBER.test(text)) text = `'${text}`;
  return /[",\n\r;]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(
  mention: string,
  header: readonly string[],
  rows: readonly (readonly CsvCell[])[],
): Buffer {
  const lines = [[`# ${mention}`], header, ...rows].map((row) => row.map(csvCell).join(','));
  return Buffer.from(`${BOM}${lines.join('\r\n')}\r\n`, 'utf8');
}
