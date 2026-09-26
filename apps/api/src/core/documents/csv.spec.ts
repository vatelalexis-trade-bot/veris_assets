import { describe, expect, it } from 'vitest';
import { csvCell, toCsv } from './csv.js';

describe('CSV exports', () => {
  it('quote the separators and escape the quotes', () => {
    expect(csvCell('Alpine, "Capital"')).toBe('"Alpine, ""Capital"""');
    expect(csvCell('2500.00')).toBe('2500.00');
    expect(csvCell(null)).toBe('');
    expect(csvCell(new Date('2026-09-26T10:00:00Z'))).toBe('2026-09-26T10:00:00.000Z');
  });

  it('never let a spreadsheet run a cell as a formula, numbers kept', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('@SUM(A1)')).toBe(`'@SUM(A1)`);
    expect(csvCell('-12.50')).toBe('-12.50');
    expect(csvCell('-cmd')).toBe(`'-cmd`);
  });

  it('start with a byte order mark and the demonstration mention', () => {
    const csv = toCsv('DEMONSTRATION - fictitious data', ['code', 'name'], [['NWGN', 'Nörthwind']]);
    expect(csv.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
    expect(csv.toString('utf8').slice(1)).toBe(
      '# DEMONSTRATION - fictitious data\r\ncode,name\r\nNWGN,Nörthwind\r\n',
    );
  });
});
