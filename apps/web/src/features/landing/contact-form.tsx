'use client';

import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, Send } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { ApiError } from '@/components/app/api-error';
import { FormField } from '@/components/app/form-field';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api/client';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Contact form (SPEC §19, docs/API.md §2.14): the only data the public site sends, and only when
 * the visitor presses the button.
 */
export function ContactForm() {
  const t = useTranslations('landing.contact');
  const locale = useLocale();
  const [fields, setFields] = useState({
    name: '',
    email: '',
    company: '',
    message: '',
    website: '',
  });
  const [consent, setConsent] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const errors = {
    name: fields.name.trim() ? undefined : t('errors.name'),
    email: EMAIL.test(fields.email.trim()) ? undefined : t('errors.email'),
    message: fields.message.trim().length >= 10 ? undefined : t('errors.message'),
    consent: consent ? undefined : t('errors.consent'),
  };
  const valid = Object.values(errors).every((error) => error === undefined);
  const send = useMutation({
    mutationFn: async () => {
      const { error } = await api.POST('/api/v1/public/contact', {
        body: {
          name: fields.name.trim(),
          email: fields.email.trim(),
          ...(fields.company.trim() ? { company: fields.company.trim() } : {}),
          message: fields.message.trim(),
          consent: true,
          ...(fields.website ? { website: fields.website } : {}),
          locale: locale === 'fr-FR' ? 'fr-FR' : 'en-GB',
        },
      });
      if (error) throw error;
    },
  });
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (valid) send.mutate();
  };
  const set = (key: keyof typeof fields) => (value: string) =>
    setFields({ ...fields, [key]: value });

  if (send.isSuccess) {
    return (
      <p
        role="status"
        className="flex items-start gap-3 rounded-2xl border border-success/40 bg-surface p-6 text-success"
      >
        <CheckCircle2 aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
        {t('success')}
      </p>
    );
  }
  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="relative flex flex-col gap-5 rounded-2xl border border-border bg-surface p-6 md:p-8"
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label={t('name')} error={submitted ? errors.name : undefined}>
          <Input
            value={fields.name}
            onChange={(event) => set('name')(event.target.value)}
            autoComplete="name"
            maxLength={120}
          />
        </FormField>
        <FormField label={t('email')} error={submitted ? errors.email : undefined}>
          <Input
            type="email"
            value={fields.email}
            onChange={(event) => set('email')(event.target.value)}
            autoComplete="email"
            maxLength={254}
          />
        </FormField>
      </div>
      <FormField label={t('company')} hint={t('companyHint')}>
        <Input
          value={fields.company}
          onChange={(event) => set('company')(event.target.value)}
          autoComplete="organization"
          maxLength={160}
        />
      </FormField>
      <FormField label={t('message')} error={submitted ? errors.message : undefined}>
        <Textarea
          value={fields.message}
          onChange={(event) => set('message')(event.target.value)}
          rows={5}
          maxLength={3000}
        />
      </FormField>
      {/* Hidden from people, filled in by robots only. */}
      <div aria-hidden="true" className="absolute -left-[9999px] size-px overflow-hidden">
        <Label htmlFor="contact-website">{t('honeypot')}</Label>
        <input
          id="contact-website"
          tabIndex={-1}
          autoComplete="off"
          value={fields.website}
          onChange={(event) => set('website')(event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-start gap-3">
          <Checkbox
            id="contact-consent"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
            aria-invalid={submitted && errors.consent ? true : undefined}
            aria-describedby={submitted && errors.consent ? 'contact-consent-error' : undefined}
            className="mt-0.5"
          />
          <Label htmlFor="contact-consent" className="text-sm font-normal">
            {t('consent')}
          </Label>
        </div>
        {submitted && errors.consent ? (
          <p id="contact-consent-error" className="text-xs text-error-text">
            {errors.consent}
          </p>
        ) : null}
      </div>
      {send.isError ? <ApiError error={send.error} /> : null}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-xs text-muted">{t('privacy')}</p>
        <Button type="submit" disabled={send.isPending} className="h-11 px-5">
          <Send aria-hidden="true" />
          {send.isPending ? t('sending') : t('submit')}
        </Button>
      </div>
    </form>
  );
}
