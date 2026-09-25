import { defineRouting } from 'next-intl/routing';

/** Languages of the application (SPEC §23.4). URLs use short prefixes: /en/… and /fr/…. */
export const routing = defineRouting({
  locales: ['en-GB', 'fr-FR'],
  defaultLocale: 'en-GB',
  localePrefix: { mode: 'always', prefixes: { 'en-GB': '/en', 'fr-FR': '/fr' } },
});

export type AppLocale = (typeof routing.locales)[number];
