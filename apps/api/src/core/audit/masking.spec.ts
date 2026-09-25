import { describe, expect, it } from 'vitest';
import { MASKED, maskSensitive } from './masking.js';

describe('audit masking', () => {
  it('masks the sensitive fields at any depth, whatever their case', () => {
    expect(
      maskSensitive({
        status: 'ACTIVE',
        Email: 'jane@example.com',
        representative: { phone: '+33 1 23 45 67 89', title: 'CFO' },
        owners: [{ dateOfBirth: '1980-01-01', share: '0.25' }],
      }),
    ).toEqual({
      status: 'ACTIVE',
      Email: MASKED,
      representative: { phone: MASKED, title: 'CFO' },
      owners: [{ dateOfBirth: MASKED, share: '0.25' }],
    });
  });

  it('masks the personal fields named by the caller', () => {
    expect(maskSensitive({ name: 'Jane Doe', locale: 'fr-FR' }, ['name'])).toEqual({
      name: MASKED,
      locale: 'fr-FR',
    });
  });

  it('keeps empty values visible, so that "no value" stays readable', () => {
    expect(maskSensitive({ email: null, taxId: undefined })).toEqual({
      email: null,
      taxId: undefined,
    });
  });

  it('writes dates as UTC strings and leaves plain values unchanged', () => {
    expect(maskSensitive({ at: new Date('2026-09-25T10:00:00Z') })).toEqual({
      at: '2026-09-25T10:00:00.000Z',
    });
    expect(maskSensitive('text')).toBe('text');
  });
});
