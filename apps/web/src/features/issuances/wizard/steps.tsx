'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ASSET_CATEGORIES,
  BUSINESS_DAY_CONVENTIONS,
  DAY_COUNTS,
  DISTRIBUTION_FREQUENCIES,
  INVESTOR_CLASSIFICATIONS,
  INVESTOR_TYPES,
  ISSUANCE_DOCUMENT_KINDS,
  ROUNDING_METHODS,
  type IssuanceDocumentKind,
} from '@veris/shared';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState, type ReactElement } from 'react';
import { ApiError } from '@/components/app/api-error';
import { FormField } from '@/components/app/form-field';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { UploadForm } from '@/features/documents/upload-form';
import { CountrySelect, CurrencySelect } from '@/features/tenants/tenant-fields';
import { api } from '@/lib/api/client';
import { fractionToPercent, percentToFraction } from '../format';
import type { StepProps } from './issuance-wizard';
import { useAutosave } from './use-autosave';

const AMOUNT = /^\d{1,20}([.,]\d{1,4})?$/;
const UNITS = /^\d{1,20}$/;
const WHOLE = /^\d{1,5}$/;

/** Text typed by the user → value for the API ('' = no value). */
const orNull = (value: string) => value.trim() || null;
const decimalOrNull = (value: string) => orNull(value.replace(',', '.'));

/** Autosave of a step, reported to the wizard. */
function useStepSave<T extends object>(
  props: StepProps,
  values: T,
  initial: T,
  save: (changes: Partial<T>) => Promise<void>,
) {
  const { state, error, flush } = useAutosave(values, initial, save);
  const { registerFlush, onState } = props;
  useEffect(() => registerFlush(flush), [registerFlush, flush]);
  useEffect(() => onState(state), [onState, state]);
  return error;
}

/** The first problem of a field: the user's typing, then the checks of SPEC §6.3. */
function useFieldError(props: StepProps) {
  const t = useTranslations();
  return (field: string, typed?: string | false) => {
    if (typed) return typed;
    const failure = props.failuresOf(field)[0];
    return failure && failure.code !== 'REQUIRED_FIELD_MISSING'
      ? t(`issuanceTermsRules.${failure.code}`)
      : undefined;
  };
}

function Grid({ children }: { children: ReactElement | ReactElement[] }) {
  return <div className="grid gap-4 md:grid-cols-2">{children}</div>;
}

// Step 1 — general information

export function GeneralStep(props: StepProps) {
  const t = useTranslations('issuances');
  const { issuance } = props;
  const initial = {
    name: issuance.name,
    code: issuance.code,
    description: issuance.description ?? '',
    assetCategory: issuance.assetCategory ?? '',
    countryCode: issuance.countryCode ?? '',
    currency: issuance.currency ?? '',
    legalIssuerName: issuance.legalIssuerName ?? '',
    spvName: issuance.spvName ?? '',
  };
  const [values, setValues] = useState(initial);
  const error = useStepSave(props, values, initial, (changes) => {
    const body: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(changes)) {
      // Name and code cannot be empty: an empty field is simply not saved.
      if ((key === 'name' || key === 'code') && !value.trim()) continue;
      body[key] = key === 'code' ? value.trim().toUpperCase() : orNull(value);
    }
    return Object.keys(body).length > 0 ? props.save.general(body) : Promise.resolve();
  });
  const set = (key: keyof typeof initial) => (event: { target: { value: string } }) =>
    setValues({ ...values, [key]: event.target.value });
  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-heading text-lg font-semibold">{t('wizard.stepNames.GENERAL')}</h2>
      <Grid>
        <FormField label={t('fields.name')}>
          <Input value={values.name} onChange={set('name')} maxLength={200} />
        </FormField>
        <FormField label={t('fields.code')} hint={t('fields.codeHint')}>
          <Input value={values.code} onChange={set('code')} maxLength={20} />
        </FormField>
        <FormField label={t('fields.assetCategory')}>
          <Select value={values.assetCategory} onChange={set('assetCategory')}>
            <option value="" />
            {ASSET_CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {t(`categories.${value}`)}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label={t('fields.countryCode')}>
          <CountrySelect value={values.countryCode} onChange={set('countryCode')} />
        </FormField>
        <FormField label={t('fields.currency')}>
          <CurrencySelect value={values.currency} onChange={set('currency')} />
        </FormField>
        <FormField label={t('fields.legalIssuerName')}>
          <Input value={values.legalIssuerName} onChange={set('legalIssuerName')} maxLength={200} />
        </FormField>
        <FormField label={t('fields.spvName')}>
          <Input value={values.spvName} onChange={set('spvName')} maxLength={200} />
        </FormField>
      </Grid>
      <FormField label={t('fields.description')}>
        <Textarea value={values.description} onChange={set('description')} maxLength={4000} />
      </FormField>
      {error ? <ApiError error={error} /> : null}
    </div>
  );
}

// Step 2 — financial terms

export function FinancialStep(props: StepProps) {
  const t = useTranslations('issuances');
  const { terms } = props.issuance;
  const initial = {
    targetAmount: terms.targetAmount ?? '',
    minimumAmount: terms.minimumAmount ?? '',
    maximumAmount: terms.maximumAmount ?? '',
    nominalValue: terms.nominalValue ?? '',
    totalUnits: terms.totalUnits ?? '',
    ratePercent: terms.interestRate ? fractionToPercent(terms.interestRate) : '',
    distributionFrequency: terms.distributionFrequency ?? '',
    issueDate: terms.issueDate ?? '',
    maturityDate: terms.maturityDate ?? '',
    subscriptionStartDate: terms.subscriptionStartDate ?? '',
    subscriptionEndDate: terms.subscriptionEndDate ?? '',
    minSubscriptionAmount: terms.minSubscriptionAmount ?? '',
    maxAmountPerInvestor: terms.maxAmountPerInvestor ?? '',
  };
  const [values, setValues] = useState(initial);
  const invalid = (key: keyof typeof initial): boolean => {
    const value = values[key].trim();
    if (!value) return false;
    if (key === 'totalUnits') return !UNITS.test(value);
    if (key === 'ratePercent') return percentToFraction(value) === null;
    return key.endsWith('Amount') || key === 'nominalValue' ? !AMOUNT.test(value) : false;
  };
  const error = useStepSave(props, values, initial, (changes) => {
    const body: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(changes) as [keyof typeof initial, string][]) {
      if (invalid(key)) continue; // Shown next to the field; saved once corrected.
      if (key === 'ratePercent') body.interestRate = value.trim() ? percentToFraction(value) : null;
      else body[key] = decimalOrNull(value);
    }
    return Object.keys(body).length > 0 ? props.save.terms(body) : Promise.resolve();
  });
  const fieldError = useFieldError(props);
  const typed = (key: keyof typeof initial) => invalid(key) && t('wizard.invalidNumber');
  const set = (key: keyof typeof initial) => (event: { target: { value: string } }) =>
    setValues({ ...values, [key]: event.target.value });
  const amountField = (key: keyof typeof initial, apiField = key) => (
    <FormField
      key={key}
      label={t(`fields.${key}`)}
      error={fieldError(`terms.${apiField}`, typed(key))}
    >
      <Input inputMode="decimal" value={values[key]} onChange={set(key)} />
    </FormField>
  );
  const dateField = (key: keyof typeof initial) => (
    <FormField key={key} label={t(`fields.${key}`)} error={fieldError(`terms.${key}`)}>
      <Input type="date" value={values[key]} onChange={set(key)} />
    </FormField>
  );
  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-heading text-lg font-semibold">{t('wizard.stepNames.FINANCIAL')}</h2>
      <p className="text-sm text-muted">
        {t('wizard.financialHelp', { currency: props.issuance.currency ?? '—' })}
      </p>
      <Grid>
        {amountField('nominalValue')}
        <FormField
          label={t('fields.totalUnits')}
          error={fieldError('terms.totalUnits', typed('totalUnits'))}
        >
          <Input inputMode="numeric" value={values.totalUnits} onChange={set('totalUnits')} />
        </FormField>
        {amountField('targetAmount')}
        {amountField('minimumAmount')}
        {amountField('maximumAmount')}
        <FormField
          label={t('fields.ratePercent')}
          hint={t('fields.rateHint')}
          error={fieldError('terms.interestRate', typed('ratePercent'))}
        >
          <Input inputMode="decimal" value={values.ratePercent} onChange={set('ratePercent')} />
        </FormField>
        <FormField label={t('fields.distributionFrequency')}>
          <Select value={values.distributionFrequency} onChange={set('distributionFrequency')}>
            <option value="" />
            {DISTRIBUTION_FREQUENCIES.map((value) => (
              <option key={value} value={value}>
                {t(`frequencies.${value}`)}
              </option>
            ))}
          </Select>
        </FormField>
        {dateField('subscriptionStartDate')}
        {dateField('subscriptionEndDate')}
        {dateField('issueDate')}
        {dateField('maturityDate')}
        {amountField('minSubscriptionAmount')}
        {amountField('maxAmountPerInvestor')}
      </Grid>
      {error ? <ApiError error={error} /> : null}
    </div>
  );
}

// Step 3 — eligibility rules

function CountriesField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
}) {
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
    <FormField label={label}>
      <Select
        multiple
        size={6}
        className="h-auto"
        value={value}
        onChange={(event) =>
          onChange([...event.target.selectedOptions].map((option) => option.value))
        }
      >
        {named.map((country) => (
          <option key={country.code} value={country.code}>
            {country.name}
          </option>
        ))}
      </Select>
    </FormField>
  );
}

export function EligibilityStep(props: StepProps) {
  const t = useTranslations('issuances');
  const tInvestors = useTranslations('investors');
  const rules = props.issuance.eligibilityRules;
  const initial = {
    professionalOnly: rules.professionalOnly,
    kycRequired: rules.kycRequired,
    kycMinRemainingValidityDays: String(rules.kycMinRemainingValidityDays),
    allowedCountries: rules.allowedCountries,
    excludedCountries: rules.excludedCountries,
    allowedInvestorTypes: rules.allowedInvestorTypes as string[],
    allowedClassifications: rules.allowedClassifications as string[],
    transfersAllowed: rules.transfersAllowed,
    manualTransferApproval: rules.manualTransferApproval,
    maxInvestors: rules.maxInvestors === null ? '' : String(rules.maxInvestors),
    lockupEndDate: rules.lockupEndDate ?? '',
  };
  const [values, setValues] = useState(initial);
  const error = useStepSave(props, values, initial, (changes) => {
    const body: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(changes)) {
      if (key === 'kycMinRemainingValidityDays') {
        if (WHOLE.test(String(value))) body[key] = Number.parseInt(String(value), 10);
      } else if (key === 'maxInvestors') {
        if (value === '') body[key] = null;
        else if (WHOLE.test(String(value)) && String(value) !== '0')
          body[key] = Number.parseInt(String(value), 10);
      } else if (key === 'lockupEndDate') body[key] = orNull(String(value));
      else body[key] = value;
    }
    return Object.keys(body).length > 0 ? props.save.rules(body) : Promise.resolve();
  });
  const fieldError = useFieldError(props);
  const toggle = (
    key: 'allowedInvestorTypes' | 'allowedClassifications',
    item: string,
    on: boolean,
  ) =>
    setValues({
      ...values,
      [key]: on ? [...values[key], item] : values[key].filter((existing) => existing !== item),
    });
  const flag = (
    key: 'professionalOnly' | 'kycRequired' | 'transfersAllowed' | 'manualTransferApproval',
  ) => (
    <label className="flex items-center gap-2 text-sm">
      <Checkbox
        checked={values[key]}
        onChange={(event) => setValues({ ...values, [key]: event.target.checked })}
      />
      {t(`fields.${key}`)}
    </label>
  );
  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-heading text-lg font-semibold">{t('wizard.stepNames.ELIGIBILITY')}</h2>
      <Grid>
        {flag('professionalOnly')}
        {flag('kycRequired')}
        <FormField label={t('fields.kycMinRemainingValidityDays')}>
          <Input
            inputMode="numeric"
            value={values.kycMinRemainingValidityDays}
            onChange={(event) =>
              setValues({
                ...values,
                kycMinRemainingValidityDays: event.target.value.replace(/\D/g, ''),
              })
            }
          />
        </FormField>
        <FormField label={t('fields.maxInvestors')} hint={t('fields.maxInvestorsHint')}>
          <Input
            inputMode="numeric"
            value={values.maxInvestors}
            onChange={(event) =>
              setValues({ ...values, maxInvestors: event.target.value.replace(/\D/g, '') })
            }
          />
        </FormField>
        <CountriesField
          label={t('fields.excludedCountries')}
          value={values.excludedCountries}
          onChange={(value) => setValues({ ...values, excludedCountries: value })}
        />
        <CountriesField
          label={t('fields.allowedCountries')}
          value={values.allowedCountries}
          onChange={(value) => setValues({ ...values, allowedCountries: value })}
        />
      </Grid>
      {fieldError('eligibilityRules.excludedCountries') ? (
        <p role="alert" className="text-sm text-error-text">
          {fieldError('eligibilityRules.excludedCountries')}
        </p>
      ) : null}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">{t('fields.allowedInvestorTypes')}</legend>
        {INVESTOR_TYPES.map((value) => (
          <label key={value} className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={values.allowedInvestorTypes.includes(value)}
              onChange={(event) => toggle('allowedInvestorTypes', value, event.target.checked)}
            />
            {tInvestors(`type.${value}`)}
          </label>
        ))}
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">{t('fields.allowedClassifications')}</legend>
        {INVESTOR_CLASSIFICATIONS.map((value) => (
          <label key={value} className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={values.allowedClassifications.includes(value)}
              onChange={(event) => toggle('allowedClassifications', value, event.target.checked)}
            />
            {tInvestors(`classification.${value}`)}
          </label>
        ))}
      </fieldset>
      <p className="text-sm text-muted">{t('fields.emptyListHint')}</p>
      <Grid>
        {flag('transfersAllowed')}
        {flag('manualTransferApproval')}
        <FormField label={t('fields.lockupEndDate')} hint={t('fields.lockupHint')}>
          <Input
            type="date"
            value={values.lockupEndDate}
            onChange={(event) => setValues({ ...values, lockupEndDate: event.target.value })}
          />
        </FormField>
      </Grid>
      {error ? <ApiError error={error} /> : null}
    </div>
  );
}

// Step 4 — servicing

export function ServicingStep(props: StepProps) {
  const t = useTranslations('issuances');
  const { terms } = props.issuance;
  const initial = {
    dayCount: terms.dayCount ?? '',
    gracePeriodDays: String(terms.gracePeriodDays),
    roundingMethod: terms.roundingMethod as string,
    businessDayConvention: terms.businessDayConvention as string,
    recordDateOffsetBusinessDays: String(terms.recordDateOffsetBusinessDays),
    earlyRedemptionAllowed: terms.earlyRedemptionAllowed,
  };
  const [values, setValues] = useState(initial);
  const error = useStepSave(props, values, initial, (changes) => {
    const body: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(changes)) {
      if (key === 'gracePeriodDays' || key === 'recordDateOffsetBusinessDays') {
        if (WHOLE.test(String(value))) body[key] = Number.parseInt(String(value), 10);
      } else if (key === 'dayCount') body[key] = orNull(String(value));
      else body[key] = value;
    }
    return Object.keys(body).length > 0 ? props.save.terms(body) : Promise.resolve();
  });
  const select = (
    key: 'dayCount' | 'roundingMethod' | 'businessDayConvention',
    options: readonly string[],
    empty = false,
  ) => (
    <FormField label={t(`fields.${key}`)}>
      <Select
        value={values[key]}
        onChange={(event) => setValues({ ...values, [key]: event.target.value })}
      >
        {empty ? <option value="" /> : null}
        {options.map((value) => (
          <option key={value} value={value}>
            {t(`${key}Options.${value}`)}
          </option>
        ))}
      </Select>
    </FormField>
  );
  const whole = (key: 'gracePeriodDays' | 'recordDateOffsetBusinessDays', hint?: string) => (
    <FormField label={t(`fields.${key}`)} hint={hint}>
      <Input
        inputMode="numeric"
        value={values[key]}
        onChange={(event) => setValues({ ...values, [key]: event.target.value.replace(/\D/g, '') })}
      />
    </FormField>
  );
  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-heading text-lg font-semibold">{t('wizard.stepNames.SERVICING')}</h2>
      <Grid>
        {select('dayCount', DAY_COUNTS, true)}
        {select('roundingMethod', ROUNDING_METHODS)}
        {select('businessDayConvention', BUSINESS_DAY_CONVENTIONS)}
        {whole('recordDateOffsetBusinessDays', t('fields.recordDateHint'))}
        {whole('gracePeriodDays')}
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={values.earlyRedemptionAllowed}
            onChange={(event) =>
              setValues({ ...values, earlyRedemptionAllowed: event.target.checked })
            }
          />
          {t('fields.earlyRedemptionAllowed')}
        </label>
      </Grid>
      <p className="text-sm text-muted">{t('wizard.principalAtMaturity')}</p>
      {error ? <ApiError error={error} /> : null}
    </div>
  );
}

// Step 5 — documents

export function DocumentsStep(props: StepProps) {
  const t = useTranslations('issuances');
  const queryClient = useQueryClient();
  const id = props.issuance.id;
  const [kind, setKind] = useState<IssuanceDocumentKind>('TERM_SHEET');
  const attached = useQuery({
    queryKey: ['issuance', id, 'documents'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/issuances/{id}/documents', {
        params: { path: { id } },
      });
      if (error) throw error;
      return data;
    },
  });
  const attach = useMutation({
    mutationFn: async (documentId: string) => {
      const { error } = await api.POST('/api/v1/issuances/{id}/documents', {
        params: { path: { id } },
        body: { documentId, kind },
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['issuance', id, 'documents'] }),
  });
  useEffect(() => props.registerFlush(() => Promise.resolve(undefined)), [props]);
  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-heading text-lg font-semibold">{t('wizard.stepNames.DOCUMENTS')}</h2>
      <p className="text-sm text-muted">{t('wizard.documentsHelp')}</p>
      <ul className="flex flex-col divide-y divide-border text-sm">
        {(attached.data ?? []).map((item) => (
          <li key={item.documentId} className="py-2">
            {item.name} · <span className="text-muted">{t(`documentKinds.${item.kind}`)}</span>
          </li>
        ))}
      </ul>
      {attached.data?.length === 0 ? (
        <p className="text-sm text-muted">{t('wizard.noDocuments')}</p>
      ) : null}
      <FormField label={t('fields.documentKind')}>
        <Select
          value={kind}
          onChange={(event) => setKind(event.target.value as IssuanceDocumentKind)}
        >
          {ISSUANCE_DOCUMENT_KINDS.map((value) => (
            <option key={value} value={value}>
              {t(`documentKinds.${value}`)}
            </option>
          ))}
        </Select>
      </FormField>
      <UploadForm
        types={['ISSUANCE_DOCUMENT']}
        issuanceId={id}
        chooseConfidentiality
        onUploaded={(created) => attach.mutate(created.id)}
      />
      {attach.isError ? <ApiError error={attach.error} /> : null}
    </div>
  );
}
