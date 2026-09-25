import type { PasswordRuleCode } from '@virtus/shared';

// SPEC §24: minimum length and a check against common passwords, no arbitrary complexity rules.
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

/** Returns the rules the password breaks; an empty list means the password is accepted. */
export function checkPassword(
  password: string,
  isCommonPassword: (password: string) => boolean,
): PasswordRuleCode[] {
  const problems: PasswordRuleCode[] = [];
  const length = [...password].length;
  if (length < PASSWORD_MIN_LENGTH) problems.push('PASSWORD_TOO_SHORT');
  if (length > PASSWORD_MAX_LENGTH) problems.push('PASSWORD_TOO_LONG');
  if (isCommonPassword(password)) problems.push('PASSWORD_TOO_COMMON');
  return problems;
}
