/**
 * Recipient code of an investor (decision D-010): what a sender types to transfer units, instead
 * of choosing the recipient in a list. Crockford base 32 without the ambiguous letters I, L, O, U,
 * e.g. `VA-7KQ2-M9XD`.
 */
export const RECIPIENT_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const RECIPIENT_CODE = /^VA-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;

/** Builds a code from 8 random numbers (0 to 31) given by the caller. */
export function recipientCodeFrom(randomValues: readonly number[]): string {
  if (randomValues.length !== 8) throw new Error('A recipient code needs 8 random values');
  const characters = randomValues.map((value) => RECIPIENT_CODE_ALPHABET[value % 32]).join('');
  return `VA-${characters.slice(0, 4)}-${characters.slice(4)}`;
}

/** Codes are typed by people: spaces and lower case are accepted. */
export function normaliseRecipientCode(input: string): string {
  return input.replace(/\s+/g, '').toUpperCase();
}
