import {
  ELIGIBILITY_RULE_CODES,
  ERROR_CODES,
  ISSUANCE_TERMS_RULE_CODES,
  PASSWORD_RULE_CODES,
  STATUS_DOMAINS,
  STATUS_TONES,
  statusLabelKey,
} from '@veris/shared';
import { describe, expect, it } from 'vitest';
import { PORTALS } from '@/features/navigation/portals';
import { MESSAGES } from '@/test/render';
import { routing } from './routing';

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ''): Record<string, string> {
  return Object.entries(tree).reduce<Record<string, string>>((flat, [key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === 'string'
      ? { ...flat, [path]: value }
      : { ...flat, ...flatten(value, path) };
  }, {});
}

const flat = {
  'en-GB': flatten(MESSAGES['en-GB'] as Tree),
  'fr-FR': flatten(MESSAGES['fr-FR'] as Tree),
};

/** Placeholder names used in a message, e.g. {page} and {total, plural, …} → ['page', 'total']. */
function placeholders(message: string): string[] {
  return [...message.matchAll(/\{\s*(\w+)/g)].map((match) => match[1]!).sort();
}

describe('translations (SPEC §23.4)', () => {
  it('has a message file for every application language', () => {
    expect(Object.keys(MESSAGES).sort()).toEqual([...routing.locales].sort());
  });

  it('has exactly the same keys in English and French', () => {
    expect(Object.keys(flat['fr-FR']).sort()).toEqual(Object.keys(flat['en-GB']).sort());
  });

  it('has no empty message', () => {
    for (const locale of routing.locales) {
      const empty = Object.entries(flat[locale]).filter(([, value]) => value.trim() === '');
      expect(empty, locale).toEqual([]);
    }
  });

  it('uses the same placeholders in both languages', () => {
    for (const [key, english] of Object.entries(flat['en-GB'])) {
      expect(placeholders(flat['fr-FR'][key] ?? ''), key).toEqual(placeholders(english));
    }
  });

  const required: [string, string[]][] = [
    ['error codes', ERROR_CODES.map((code) => `errors.${code}`)],
    ['eligibility rules', ELIGIBILITY_RULE_CODES.map((code) => `eligibilityRules.${code}`)],
    ['issuance terms rules', ISSUANCE_TERMS_RULE_CODES.map((code) => `issuanceTermsRules.${code}`)],
    ['password rules', PASSWORD_RULE_CODES.map((code) => `passwordRules.${code}`)],
    [
      'business statuses',
      STATUS_DOMAINS.flatMap((domain) =>
        Object.keys(STATUS_TONES[domain]).map((status) => statusLabelKey(domain, status)),
      ),
    ],
    [
      'menu entries',
      Object.values(PORTALS).flatMap((portal) =>
        portal.items.map((item) => `navigation.${portal.id}.${item.section}`),
      ),
    ],
  ];

  it.each(required)('translates every one of the %s', (_, keys) => {
    for (const locale of routing.locales) {
      const missing = keys.filter((key) => !(key in flat[locale]));
      expect(missing, locale).toEqual([]);
    }
  });

  it('shows the exact demonstration notice of SPEC §3.3', () => {
    expect(flat['fr-FR']['demoBanner.text']).toBe(
      'Environnement de démonstration — données fictives',
    );
  });
});
