import { describe, expect, it } from 'vitest';
import { isCommonPassword } from './common-passwords.js';
import { hashPassword, verifyPassword } from './password-hashing.js';

describe('password hashing', () => {
  it('uses Argon2id and verifies only the right password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    await expect(verifyPassword({ hash, password: 'correct horse battery staple' })).resolves.toBe(
      true,
    );
    await expect(verifyPassword({ hash, password: 'wrong horse battery staple' })).resolves.toBe(
      false,
    );
  });
});

describe('common passwords', () => {
  it.each(['qwerty123456', 'QWERTY123456', 'Password2026!', 'dragon'])(
    'rejects "%s"',
    (password) => {
      expect(isCommonPassword(password)).toBe(true);
    },
  );

  it('accepts an uncommon passphrase', () => {
    expect(isCommonPassword('violet tractor under the moon')).toBe(false);
  });
});
