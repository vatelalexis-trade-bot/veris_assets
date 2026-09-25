import type { EmailMessage } from '../../../core/email/email.provider.js';
import { renderEmail as render, type EmailLocale } from '../../../core/email/layout.js';

// Transactional emails of the iam module, in the recipient's language (SPEC §15, §23.4).

export { LOCALE_PATH, type EmailLocale } from '../../../core/email/layout.js';

export function invitationEmail(
  locale: EmailLocale,
  data: { to: string; name: string; url: string; validDays: number },
): EmailMessage {
  const content =
    locale === 'fr-FR'
      ? {
          subject: 'Votre invitation à Virtus Assets',
          lines: [
            `Bonjour ${data.name},`,
            'Vous êtes invité(e) à rejoindre Virtus Assets.',
            `Ce lien est valable ${data.validDays} jours et ne peut servir qu’une fois.`,
          ],
          label: 'Accepter l’invitation',
        }
      : {
          subject: 'Your invitation to Virtus Assets',
          lines: [
            `Hello ${data.name},`,
            'You have been invited to join Virtus Assets.',
            `This link is valid for ${data.validDays} days and can be used only once.`,
          ],
          label: 'Accept the invitation',
        };
  return {
    to: data.to,
    subject: content.subject,
    ...render(locale, content.lines, { url: data.url, label: content.label }),
  };
}

export function passwordResetEmail(
  locale: EmailLocale,
  data: { to: string; name: string; url: string },
): EmailMessage {
  const content =
    locale === 'fr-FR'
      ? {
          subject: 'Réinitialisation de votre mot de passe Virtus Assets',
          lines: [
            `Bonjour ${data.name},`,
            'Une réinitialisation de votre mot de passe a été demandée.',
            'Ce lien est valable une heure. Si vous n’êtes pas à l’origine de la demande, ignorez ce message.',
          ],
          label: 'Choisir un nouveau mot de passe',
        }
      : {
          subject: 'Reset your Virtus Assets password',
          lines: [
            `Hello ${data.name},`,
            'A password reset was requested for your account.',
            'This link is valid for one hour. If you did not ask for it, ignore this message.',
          ],
          label: 'Choose a new password',
        };
  return {
    to: data.to,
    subject: content.subject,
    ...render(locale, content.lines, { url: data.url, label: content.label }),
  };
}
