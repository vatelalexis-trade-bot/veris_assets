import { render } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';
import enGB from '@/i18n/messages/en-GB.json';
import frFR from '@/i18n/messages/fr-FR.json';

export const MESSAGES = { 'en-GB': enGB, 'fr-FR': frFR } as const;
export type TestLocale = keyof typeof MESSAGES;

/** Renders a component with the real translations of the given language. */
export function renderWithIntl(ui: ReactElement, locale: TestLocale = 'en-GB') {
  return render(
    <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]} timeZone="Europe/Paris">
      {ui}
    </NextIntlClientProvider>,
  );
}
