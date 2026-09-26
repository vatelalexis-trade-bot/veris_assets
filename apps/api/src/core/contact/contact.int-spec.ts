// Contact form of the public site (SPEC §19, docs/API.md §2.14).
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startIntegrationApp, type IntegrationApp } from '../../test/integration-app.js';

let ctx: IntegrationApp;

const message = {
  name: 'Claire Martin',
  email: 'claire.martin@example.com',
  company: 'Example Capital',
  message: 'We would like a demonstration of the coupon servicing.',
  consent: true,
  locale: 'fr-FR',
};

function post(body: object) {
  return request(ctx.app.getHttpServer())
    .post('/api/v1/public/contact')
    .set('Origin', ctx.env.WEB_ORIGIN)
    .send(body);
}

beforeAll(async () => {
  ctx = await startIntegrationApp();
});

afterAll(async () => {
  await ctx.close();
});

describe('contact form (public)', () => {
  it('sends the message to the team without a session, and stores nothing', async () => {
    await post(message).expect(202);
    const sent = ctx.emails.messages.filter((email) => email.to === ctx.env.CONTACT_EMAIL);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.subject).toBe('Contact request — Example Capital');
    expect(sent[0]!.text).toContain('We would like a demonstration of the coupon servicing.');
    expect(sent[0]!.text).toContain('claire.martin@example.com');
  });

  it('refuses a message without consent or with an invalid email', async () => {
    await post({ ...message, consent: false }).expect(400);
    await post({ ...message, email: 'not-an-email' }).expect(400);
    await post({ ...message, message: 'Hi' }).expect(400);
  });

  it('answers robots as usual but sends nothing', async () => {
    const before = ctx.emails.messages.length;
    await post({ ...message, website: 'https://spam.example' }).expect(202);
    expect(ctx.emails.messages.length).toBe(before);
  });

  it('limits the messages of one address', async () => {
    // Two accepted messages above: the limit of 5 per hour is reached after three more.
    for (let index = 0; index < 3; index += 1) await post(message).expect(202);
    const refused = await post(message).expect(429);
    expect((refused.body as { error: { code: string } }).error.code).toBe('RATE_LIMITED');
  });
});
