import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  Post,
} from '@nestjs/common';
import { ApiAcceptedResponse, ApiBody, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ENV, type Env } from '../config/env.js';
import { getRequestContext } from '../context/request-context.js';
import { EMAIL_PROVIDER, type EmailProvider } from '../email/email.provider.js';
import { renderEmail } from '../email/layout.js';
import { AppError } from '../errors/app-error.js';
import { toOpenApiSchema } from '../openapi/zod-openapi.js';
import { Public } from '../security/public.decorator.js';
import { RateLimiter, type RateLimit } from '../security/rate-limiter.js';
import { ZodValidationPipe } from '../validation/zod-validation.pipe.js';

/** At most 5 messages per hour from one address (docs/API.md §2.14: strict rate limiting). */
const CONTACT_PER_IP: RateLimit = { name: 'contact-ip', limit: 5, windowSeconds: 60 * 60 };

export const contactBody = z.strictObject({
  name: z.string().trim().min(1).max(120),
  email: z.email().max(254),
  company: z.string().trim().max(160).optional(),
  message: z.string().trim().min(10).max(3000),
  /** The visitor agrees to be contacted about its request; nothing else is done with the data. */
  consent: z.literal(true),
  /** Hidden field that people never fill in: robots do. */
  website: z.string().max(200).optional(),
  locale: z.enum(['en-GB', 'fr-FR']).optional(),
});

/**
 * Contact form of the public site (SPEC §19, docs/API.md §2.14): the message is sent by email to
 * the team (Mailpit in the demonstration) and is not stored.
 */
@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name);

  constructor(
    private readonly rateLimiter: RateLimiter,
    @Inject(EMAIL_PROVIDER) private readonly email: EmailProvider,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async send(request: z.infer<typeof contactBody>): Promise<void> {
    await this.rateLimiter.consume(CONTACT_PER_IP, getRequestContext()?.ipAddress ?? 'unknown');
    if (request.website) {
      // A robot: answered as usual, so that it learns nothing, but nothing is sent.
      this.logger.warn('Contact message dropped: hidden field filled in');
      return;
    }
    const lines = [
      `Name: ${request.name}`,
      `Email: ${request.email}`,
      `Company: ${request.company || '—'}`,
      `Language: ${request.locale ?? 'en-GB'}`,
      '',
      ...request.message.split(/\r?\n/),
    ];
    try {
      await this.email.send({
        to: this.env.CONTACT_EMAIL,
        subject: `Contact request — ${request.company || request.name}`,
        ...renderEmail('en-GB', lines, { url: this.env.WEB_ORIGIN, label: 'Veris Assets' }),
      });
    } catch (error) {
      this.logger.error({ err: error }, 'Contact message not sent');
      throw new AppError('PROVIDER_UNAVAILABLE');
    }
  }
}

@ApiTags('public')
@Public()
@Controller('public')
export class ContactController {
  constructor(private readonly contact: ContactService) {}

  @Post('contact')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiBody({ schema: toOpenApiSchema(contactBody) })
  @ApiAcceptedResponse({ description: 'The message is sent to the team.' })
  async create(
    @Body(new ZodValidationPipe(contactBody)) body: z.infer<typeof contactBody>,
  ): Promise<void> {
    await this.contact.send(body);
  }
}
