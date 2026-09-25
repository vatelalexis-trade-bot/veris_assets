import { describe, expect, it } from 'vitest';
import {
  MANDATORY_NOTIFICATION_CATEGORIES,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_LOCALES,
  NOTIFICATION_TYPE_CODES,
  NOTIFICATION_TYPES,
  isMandatoryCategory,
  notificationText,
} from './notifications.js';

const placeholders = (text: string) =>
  [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

describe('notification catalogue', () => {
  it('uses known categories and makes security and workflow mandatory', () => {
    for (const code of NOTIFICATION_TYPE_CODES) {
      expect(NOTIFICATION_CATEGORIES).toContain(NOTIFICATION_TYPES[code].category);
    }
    expect(MANDATORY_NOTIFICATION_CATEGORIES).toEqual(['SECURITY', 'WORKFLOW']);
    expect(isMandatoryCategory('SECURITY')).toBe(true);
    expect(isMandatoryCategory('ORGANISATION')).toBe(false);
  });

  it('has the same placeholders in every language', () => {
    for (const code of NOTIFICATION_TYPE_CODES) {
      const texts = NOTIFICATION_TYPES[code].texts;
      const [reference, ...others] = NOTIFICATION_LOCALES.map((locale) => texts[locale]);
      for (const text of others) {
        expect(placeholders(text.title + text.body)).toEqual(
          placeholders(reference!.title + reference!.body),
        );
      }
    }
  });

  it('gives the text in the requested language, placeholders filled', () => {
    expect(notificationText('INVITATION_ACCEPTED', 'fr-FR').title).toBe('Invitation acceptée');
    expect(notificationText('KYC_APPROVED', 'en-GB', { validUntil: '2027-09-25' }).body).toContain(
      'valid until 2027-09-25',
    );
  });
});
