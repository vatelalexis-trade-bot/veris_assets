import { dictionary } from '@zxcvbn-ts/language-common';

// About 49,000 common passwords from the zxcvbn-ts project (MIT licence), checked case-insensitively.
const COMMON_PASSWORDS = new Set(dictionary['passwords-common'].map((word) => word.toLowerCase()));

/**
 * True when the password is a common one, also when it only adds digits or symbols at the end
 * of a common one ("Password2026!").
 */
export function isCommonPassword(password: string): boolean {
  const lower = password.toLowerCase();
  const withoutSuffix = lower.replace(/[\d\W_]+$/u, '');
  return (
    COMMON_PASSWORDS.has(lower) || (withoutSuffix.length > 0 && COMMON_PASSWORDS.has(withoutSuffix))
  );
}
