'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { ApiError } from '@/components/app/api-error';
import { FormField } from '@/components/app/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CountrySelect } from '@/features/tenants/tenant-fields';
import { api } from '@/lib/api/client';

/** Representatives and beneficial owners: personal data, shown only with the permission (SPEC §8.5). */
export function PeoplePanel({ investorId, canManage }: { investorId: string; canManage: boolean }) {
  const t = useTranslations('investors.people');
  const queryClient = useQueryClient();
  const representatives = useQuery({
    queryKey: ['investor', investorId, 'representatives'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/investors/{id}/representatives', {
        params: { path: { id: investorId } },
      });
      if (error) throw error;
      return data;
    },
  });
  const owners = useQuery({
    queryKey: ['investor', investorId, 'beneficial-owners'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/investors/{id}/beneficial-owners', {
        params: { path: { id: investorId } },
      });
      if (error) throw error;
      return data;
    },
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['investor', investorId] });

  return (
    <section
      aria-labelledby="people-title"
      className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5"
    >
      <div>
        <h2 id="people-title" className="font-heading text-lg font-semibold">
          {t('title')}
        </h2>
        <p className="text-sm text-muted">{t('personalData')}</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">{t('representatives')}</h3>
          {representatives.isError ? <ApiError error={representatives.error} /> : null}
          <ul className="flex flex-col divide-y divide-border text-sm">
            {(representatives.data ?? []).map((person) => (
              <li key={person.id} className="py-2">
                {person.fullName}
                {person.title ? <span className="text-muted"> · {person.title}</span> : null}
                {person.email ? (
                  <span className="block text-xs text-muted">{person.email}</span>
                ) : null}
              </li>
            ))}
          </ul>
          {representatives.data?.length === 0 ? (
            <p className="text-sm text-muted">{t('none')}</p>
          ) : null}
          {canManage ? <RepresentativeForm investorId={investorId} onAdded={refresh} /> : null}
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">{t('beneficialOwners')}</h3>
          {owners.isError ? <ApiError error={owners.error} /> : null}
          <ul className="flex flex-col divide-y divide-border text-sm">
            {(owners.data ?? []).map((person) => (
              <li key={person.id} className="flex justify-between gap-2 py-2">
                <span>
                  {person.fullName}
                  {person.nationality ? (
                    <span className="text-muted"> · {person.nationality}</span>
                  ) : null}
                </span>
                <span className="tabular-nums">{person.ownershipPercentage} %</span>
              </li>
            ))}
          </ul>
          {owners.data?.length === 0 ? <p className="text-sm text-muted">{t('none')}</p> : null}
          {canManage ? <BeneficialOwnerForm investorId={investorId} onAdded={refresh} /> : null}
        </div>
      </div>
    </section>
  );
}

function RepresentativeForm({
  investorId,
  onAdded,
}: {
  investorId: string;
  onAdded: () => unknown;
}) {
  const t = useTranslations('investors.people');
  const [person, setPerson] = useState({ fullName: '', title: '', email: '' });
  const add = useMutation({
    mutationFn: async () => {
      const { error } = await api.POST('/api/v1/investors/{id}/representatives', {
        params: { path: { id: investorId } },
        body: {
          fullName: person.fullName.trim(),
          title: person.title.trim() || null,
          email: person.email.trim() || null,
        },
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      setPerson({ fullName: '', title: '', email: '' });
      await onAdded();
    },
  });
  return (
    <form
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        add.mutate();
      }}
      className="flex flex-col gap-2"
      noValidate
    >
      <FormField label={t('fullName')}>
        <Input
          value={person.fullName}
          onChange={(event) => setPerson({ ...person, fullName: event.target.value })}
        />
      </FormField>
      <FormField label={t('personTitle')}>
        <Input
          value={person.title}
          onChange={(event) => setPerson({ ...person, title: event.target.value })}
        />
      </FormField>
      <FormField label={t('email')}>
        <Input
          type="email"
          value={person.email}
          onChange={(event) => setPerson({ ...person, email: event.target.value })}
        />
      </FormField>
      {add.isError ? <ApiError error={add.error} /> : null}
      <Button
        type="submit"
        variant="secondary"
        size="sm"
        className="self-start"
        disabled={!person.fullName.trim() || add.isPending}
      >
        {t('addRepresentative')}
      </Button>
    </form>
  );
}

function BeneficialOwnerForm({
  investorId,
  onAdded,
}: {
  investorId: string;
  onAdded: () => unknown;
}) {
  const t = useTranslations('investors.people');
  const [person, setPerson] = useState({ fullName: '', nationality: '', ownershipPercentage: '' });
  const add = useMutation({
    mutationFn: async () => {
      const { error } = await api.POST('/api/v1/investors/{id}/beneficial-owners', {
        params: { path: { id: investorId } },
        body: {
          fullName: person.fullName.trim(),
          nationality: person.nationality || null,
          // Kept as text: percentages are decimals, never floating-point numbers.
          ownershipPercentage: person.ownershipPercentage.trim().replace(',', '.'),
        },
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      setPerson({ fullName: '', nationality: '', ownershipPercentage: '' });
      await onAdded();
    },
  });
  return (
    <form
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        add.mutate();
      }}
      className="flex flex-col gap-2"
      noValidate
    >
      <FormField label={t('fullName')}>
        <Input
          value={person.fullName}
          onChange={(event) => setPerson({ ...person, fullName: event.target.value })}
        />
      </FormField>
      <FormField label={t('nationality')}>
        <CountrySelect
          value={person.nationality}
          onChange={(event) => setPerson({ ...person, nationality: event.target.value })}
        />
      </FormField>
      <FormField label={t('ownership')} hint={t('ownershipHint')}>
        <Input
          inputMode="decimal"
          value={person.ownershipPercentage}
          onChange={(event) => setPerson({ ...person, ownershipPercentage: event.target.value })}
        />
      </FormField>
      {add.isError ? <ApiError error={add.error} /> : null}
      <Button
        type="submit"
        variant="secondary"
        size="sm"
        className="self-start"
        disabled={!person.fullName.trim() || !person.ownershipPercentage.trim() || add.isPending}
      >
        {t('addBeneficialOwner')}
      </Button>
    </form>
  );
}
