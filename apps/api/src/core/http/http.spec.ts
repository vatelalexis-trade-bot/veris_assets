import { describe, expect, it } from 'vitest';
import { AppError } from '../errors/app-error.js';
import { expectedVersion } from './if-match.js';
import { offsetOf, paginationQuery } from './pagination.js';

describe('If-Match', () => {
  it.each([
    ['"3"', 3],
    ['3', 3],
    ['W/"12"', 12],
  ])('reads %s', (header, version) => {
    expect(expectedVersion(header)).toBe(version);
  });

  it('requires the header', () => {
    expect(() => expectedVersion(undefined)).toThrow(
      expect.objectContaining({ code: 'PRECONDITION_REQUIRED' }) as AppError,
    );
  });

  it('refuses a malformed value', () => {
    expect(() => expectedVersion('"abc"')).toThrow(
      expect.objectContaining({ code: 'VALIDATION_FAILED' }) as AppError,
    );
  });
});

describe('pagination', () => {
  it('defaults to the first page of 25 items and caps the page size at 100', () => {
    expect(paginationQuery.parse({})).toEqual({ page: 1, pageSize: 25 });
    expect(paginationQuery.safeParse({ pageSize: '500' }).success).toBe(false);
    expect(offsetOf({ page: 3, pageSize: 25 })).toBe(50);
  });
});
