import type { EmailMessage } from './email.provider.js';

// Common layout of the emails, in the recipient's language (SPEC §15, §23.4).
// Every email carries the demonstration notice (SPEC §3.3).

export type EmailLocale = 'en-GB' | 'fr-FR';

/** URL prefix of each language in the web app (/en, /fr). */
export const LOCALE_PATH: Record<EmailLocale, string> = { 'en-GB': 'en', 'fr-FR': 'fr' };

const DEMO_NOTICE: Record<EmailLocale, string> = {
  'en-GB': 'Demonstration environment — fictitious data.',
  'fr-FR': 'Environnement de démonstration — données fictives.',
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);
}

/** Text and HTML bodies: the lines, one link, then the demonstration notice. */
export function renderEmail(
  locale: EmailLocale,
  lines: string[],
  link: { url: string; label: string },
): Omit<EmailMessage, 'to' | 'subject'> {
  const text = [...lines, '', `${link.label}: ${link.url}`, '', '—', DEMO_NOTICE[locale]].join(
    '\n',
  );
  const html = [
    ...lines.map((line) => `<p>${escapeHtml(line)}</p>`),
    `<p><a href="${escapeHtml(link.url)}">${escapeHtml(link.label)}</a></p>`,
    `<hr><p><small>${escapeHtml(DEMO_NOTICE[locale])}</small></p>`,
  ].join('\n');
  return { text, html };
}
