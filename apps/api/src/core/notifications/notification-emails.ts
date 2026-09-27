import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { notificationText } from '@veris/shared';
import { ENV, type Env } from '../config/env.js';
import { EMAIL_PROVIDER, type EmailProvider } from '../email/email.provider.js';
import { LOCALE_PATH, renderEmail, type EmailLocale } from '../email/layout.js';
import { JobQueue } from '../jobs/job-queue.js';
import { QUEUES } from '../jobs/queues.js';
import type { NotificationEmailJob } from './notification.service.js';

/** Contact details of a notification recipient, provided by the module that owns the users. */
export interface NotificationRecipient {
  email: string;
  locale: EmailLocale;
  active: boolean;
}

export type RecipientLookup = (
  tenantId: string | null,
  userId: string,
) => Promise<NotificationRecipient | null>;

const OPEN_APP: Record<EmailLocale, string> = {
  'en-GB': 'Open Veris Assets',
  'fr-FR': 'Ouvrir Veris Assets',
};

/**
 * Sends the email of a notification (`notification-email` job). The email address is looked up
 * when sending, so that no personal data is stored in the job queue.
 */
@Injectable()
export class NotificationEmails implements OnApplicationBootstrap {
  private readonly logger = new Logger(NotificationEmails.name);
  private lookup: RecipientLookup | undefined;

  constructor(
    private readonly jobs: JobQueue,
    @Inject(EMAIL_PROVIDER) private readonly email: EmailProvider,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Called once by the identity module, which owns the users (the core never imports it). */
  useRecipientLookup(lookup: RecipientLookup): void {
    this.lookup = lookup;
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.jobs.work<NotificationEmailJob>(QUEUES.notificationEmail.name, (job) =>
      this.deliver(job),
    );
  }

  async deliver(job: NotificationEmailJob): Promise<void> {
    if (!this.lookup) throw new Error('No recipient lookup registered for notification emails');
    const recipient = await this.lookup(job.tenantId, job.userId);
    if (!recipient?.active) {
      this.logger.log(
        { userId: job.userId, type: job.type },
        'Notification email skipped: inactive user',
      );
      return;
    }
    const text = notificationText(job.type, recipient.locale, job.params);
    await this.email.send({
      to: recipient.email,
      subject: text.title,
      ...renderEmail(recipient.locale, [text.body], {
        url: `${this.env.WEB_ORIGIN}/${LOCALE_PATH[recipient.locale]}`,
        label: OPEN_APP[recipient.locale],
      }),
    });
  }
}
