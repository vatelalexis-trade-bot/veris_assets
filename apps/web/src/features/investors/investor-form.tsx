'use client';

import {
  INVESTOR_CLASSIFICATIONS,
  INVESTOR_TYPES,
  PROFILE_STATUSES,
  type InvestorClassification,
  type InvestorType,
  type ProfileStatus,
} from '@veris/shared';
import { useTranslations } from 'next-intl';
import { FormField } from '@/components/app/form-field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { CountrySelect } from '@/features/tenants/tenant-fields';
import type { InvestorView } from './types';

/** Values of the investor form, all as text (empty = no value). */
export interface InvestorFormValues {
  type: InvestorType;
  legalName: string;
  tradeName: string;
  legalForm: string;
  registrationNumber: string;
  taxId: string;
  countryOfIncorporation: string;
  classification: InvestorClassification;
  profileStatus: ProfileStatus;
  contactEmail: string;
  phone: string;
  line1: string;
  line2: string;
  postalCode: string;
  city: string;
  addressCountry: string;
}

export const EMPTY_INVESTOR: InvestorFormValues = {
  type: 'LEGAL_ENTITY',
  legalName: '',
  tradeName: '',
  legalForm: '',
  registrationNumber: '',
  taxId: '',
  countryOfIncorporation: '',
  classification: 'PROFESSIONAL',
  profileStatus: 'DRAFT',
  contactEmail: '',
  phone: '',
  line1: '',
  line2: '',
  postalCode: '',
  city: '',
  addressCountry: '',
};

export function valuesOf(investor: InvestorView): InvestorFormValues {
  return {
    type: investor.type,
    legalName: investor.legalName,
    tradeName: investor.tradeName ?? '',
    legalForm: investor.legalForm ?? '',
    registrationNumber: investor.registrationNumber ?? '',
    taxId: investor.taxId ?? '',
    countryOfIncorporation: investor.countryOfIncorporation,
    classification: investor.classification,
    profileStatus: investor.profileStatus,
    contactEmail: investor.contactEmail ?? '',
    phone: investor.phone ?? '',
    line1: investor.address?.line1 ?? '',
    line2: investor.address?.line2 ?? '',
    postalCode: investor.address?.postalCode ?? '',
    city: investor.address?.city ?? '',
    addressCountry: investor.address?.countryCode ?? '',
  };
}

const orNull = (value: string) => value.trim() || null;

/** Body for the API: empty texts become null; the address is sent only when complete. */
export function bodyOf(values: InvestorFormValues) {
  const address =
    values.line1 && values.postalCode && values.city && values.addressCountry
      ? {
          line1: values.line1.trim(),
          line2: orNull(values.line2),
          postalCode: values.postalCode.trim(),
          city: values.city.trim(),
          countryCode: values.addressCountry,
        }
      : null;
  return {
    type: values.type,
    legalName: values.legalName.trim(),
    tradeName: orNull(values.tradeName),
    legalForm: orNull(values.legalForm),
    registrationNumber: orNull(values.registrationNumber),
    taxId: orNull(values.taxId),
    countryOfIncorporation: values.countryOfIncorporation,
    classification: values.classification,
    profileStatus: values.profileStatus,
    contactEmail: orNull(values.contactEmail),
    phone: orNull(values.phone),
    address,
  };
}

/** Fields of an investor profile (SPEC §8.1). */
export function InvestorFields({
  values,
  onChange,
  disabled,
}: {
  values: InvestorFormValues;
  onChange: (values: InvestorFormValues) => void;
  disabled?: boolean;
}) {
  const t = useTranslations('investors');
  const set = (key: keyof InvestorFormValues) => (event: { target: { value: string } }) =>
    onChange({ ...values, [key]: event.target.value });
  return (
    <fieldset disabled={disabled} className="grid gap-4 md:grid-cols-2">
      <legend className="sr-only">{t('form.legend')}</legend>
      <FormField label={t('form.type')}>
        <Select value={values.type} onChange={set('type')}>
          {INVESTOR_TYPES.map((value) => (
            <option key={value} value={value}>
              {t(`type.${value}`)}
            </option>
          ))}
        </Select>
      </FormField>
      <FormField label={t('columns.classification')}>
        <Select value={values.classification} onChange={set('classification')}>
          {INVESTOR_CLASSIFICATIONS.map((value) => (
            <option key={value} value={value}>
              {t(`classification.${value}`)}
            </option>
          ))}
        </Select>
      </FormField>
      <FormField label={t('columns.legalName')}>
        <Input value={values.legalName} onChange={set('legalName')} required maxLength={200} />
      </FormField>
      <FormField label={t('form.tradeName')}>
        <Input value={values.tradeName} onChange={set('tradeName')} maxLength={200} />
      </FormField>
      <FormField label={t('form.legalForm')}>
        <Input value={values.legalForm} onChange={set('legalForm')} maxLength={100} />
      </FormField>
      <FormField label={t('form.registrationNumber')}>
        <Input
          value={values.registrationNumber}
          onChange={set('registrationNumber')}
          maxLength={100}
        />
      </FormField>
      <FormField label={t('form.taxId')}>
        <Input value={values.taxId} onChange={set('taxId')} maxLength={50} />
      </FormField>
      <FormField label={t('form.countryOfIncorporation')}>
        <CountrySelect
          value={values.countryOfIncorporation}
          onChange={set('countryOfIncorporation')}
          required
        />
      </FormField>
      <FormField label={t('columns.profileStatus')}>
        <Select value={values.profileStatus} onChange={set('profileStatus')}>
          {PROFILE_STATUSES.map((value) => (
            <option key={value} value={value}>
              {t(`profileStatus.${value}`)}
            </option>
          ))}
        </Select>
      </FormField>
      <FormField label={t('form.contactEmail')}>
        <Input type="email" value={values.contactEmail} onChange={set('contactEmail')} />
      </FormField>
      <FormField label={t('form.phone')}>
        <Input type="tel" value={values.phone} onChange={set('phone')} />
      </FormField>
      <AddressFields values={values} onChange={onChange} />
    </fieldset>
  );
}

/** Postal address: sent only when line, postal code, city and country are all given. */
export function AddressFields({
  values,
  onChange,
}: {
  values: Pick<InvestorFormValues, 'line1' | 'line2' | 'postalCode' | 'city' | 'addressCountry'>;
  onChange: (values: InvestorFormValues) => void;
}) {
  const t = useTranslations('investors.form');
  const set =
    (key: 'line1' | 'line2' | 'postalCode' | 'city' | 'addressCountry') =>
    (event: { target: { value: string } }) =>
      onChange({ ...(values as InvestorFormValues), [key]: event.target.value });
  return (
    <>
      <h3 className="font-heading text-sm font-semibold md:col-span-2">{t('address')}</h3>
      <FormField label={t('line1')}>
        <Input value={values.line1} onChange={set('line1')} autoComplete="address-line1" />
      </FormField>
      <FormField label={t('line2')}>
        <Input value={values.line2} onChange={set('line2')} autoComplete="address-line2" />
      </FormField>
      <FormField label={t('postalCode')}>
        <Input value={values.postalCode} onChange={set('postalCode')} autoComplete="postal-code" />
      </FormField>
      <FormField label={t('city')}>
        <Input value={values.city} onChange={set('city')} autoComplete="address-level2" />
      </FormField>
      <FormField label={t('addressCountry')}>
        <CountrySelect value={values.addressCountry} onChange={set('addressCountry')} />
      </FormField>
    </>
  );
}
