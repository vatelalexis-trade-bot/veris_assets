import nodemailer, { type Transporter } from 'nodemailer';
import type { Env } from '../config/env.js';
import type { EmailMessage, EmailProvider } from './email.provider.js';

/** Sends through SMTP; in Codespaces the SMTP server is Mailpit, so no email leaves the machine. */
export class SmtpEmailProvider implements EmailProvider {
  private readonly transporter: Transporter;

  constructor(private readonly env: Env) {
    this.transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: false,
    });
  }

  async send(message: EmailMessage): Promise<void> {
    await this.transporter.sendMail({ from: this.env.MAIL_FROM, ...message });
  }
}
