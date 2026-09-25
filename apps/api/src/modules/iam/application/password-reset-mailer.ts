import { Inject, Injectable } from '@nestjs/common';
import { ENV, type Env } from '../../../core/config/env.js';
import { EMAIL_PROVIDER, type EmailProvider } from '../../../core/email/email.provider.js';
import { LOCALE_PATH, passwordResetEmail, type EmailLocale } from '../infrastructure/emails.js';
import { IdentityRepository } from '../infrastructure/identity.repository.js';

/** Sends the password reset link in the user's language, to the web app's reset page. */
@Injectable()
export class PasswordResetMailer {
  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(EMAIL_PROVIDER) private readonly email: EmailProvider,
    private readonly identities: IdentityRepository,
  ) {}

  async send({
    userId,
    email,
    token,
  }: {
    userId: string;
    email: string;
    token: string;
  }): Promise<void> {
    const identity = await this.identities.findUserById(userId);
    const locale: EmailLocale = identity?.locale === 'fr-FR' ? 'fr-FR' : 'en-GB';
    const url = `${this.env.WEB_ORIGIN}/${LOCALE_PATH[locale]}/reset-password?token=${encodeURIComponent(token)}`;
    await this.email.send(
      passwordResetEmail(locale, { to: email, name: identity?.name ?? '', url }),
    );
  }
}
