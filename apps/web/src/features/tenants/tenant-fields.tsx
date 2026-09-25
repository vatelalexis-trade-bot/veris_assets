'use client';

import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import type { ComponentProps } from 'react';
import { Select } from '@/components/ui/select';
import { api } from '@/lib/api/client';

type SelectProps = Omit<ComponentProps<'select'>, 'children'>;

/** Countries of the reference data (core.country), named in the interface language. */
export function CountrySelect(props: SelectProps) {
  const locale = useLocale();
  const countries = useQuery({
    queryKey: ['reference', 'countries'],
    queryFn: async () => (await api.GET('/api/v1/reference/countries')).data ?? [],
    staleTime: Infinity,
  });
  const named = (countries.data ?? [])
    .map((country) => ({
      code: country.code,
      name: locale === 'fr-FR' ? country.nameFr : country.nameEn,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));
  return (
    <Select {...props}>
      <option value="" disabled />
      {named.map((country) => (
        <option key={country.code} value={country.code}>
          {country.name}
        </option>
      ))}
    </Select>
  );
}

export function CurrencySelect(props: SelectProps) {
  const currencies = useQuery({
    queryKey: ['reference', 'currencies'],
    queryFn: async () => (await api.GET('/api/v1/reference/currencies')).data ?? [],
    staleTime: Infinity,
  });
  return (
    <Select {...props}>
      <option value="" disabled />
      {(currencies.data ?? []).map((currency) => (
        <option key={currency.code} value={currency.code}>
          {currency.code}
        </option>
      ))}
    </Select>
  );
}

/** Time zones of the IANA database known to the browser (the API checks them again). */
export function TimezoneSelect(props: SelectProps) {
  return (
    <Select {...props}>
      {Intl.supportedValuesOf('timeZone').map((zone) => (
        <option key={zone} value={zone}>
          {zone}
        </option>
      ))}
    </Select>
  );
}

export function LocaleSelect(props: SelectProps) {
  const t = useTranslations('languages');
  return (
    <Select {...props}>
      <option value="en-GB">{t('en-GB')}</option>
      <option value="fr-FR">{t('fr-FR')}</option>
    </Select>
  );
}

export const ORGANIZATION_TYPES = ['ASSET_MANAGER', 'ISSUER', 'FUND'] as const;

export function OrganizationTypeSelect(props: SelectProps) {
  const t = useTranslations('organizationTypes');
  return (
    <Select {...props}>
      {ORGANIZATION_TYPES.map((type) => (
        <option key={type} value={type}>
          {t(type)}
        </option>
      ))}
    </Select>
  );
}
