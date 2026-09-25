// Minimal deterministic demonstration data (phase 3). Every name is fictitious (SPEC §3.3, §28).
import { CURRENCY_MINOR_UNITS } from '@virtus/shared';
import { deterministicUuid } from './deterministic-id.js';

/** EU and EEA countries, plus the other countries used by the demonstration scenarios. */
// prettier-ignore
const COUNTRY_CODES = [
  'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'HU', 'IE', 'IT',
  'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK', // European Union
  'IS', 'LI', 'NO', // European Economic Area
  'CH', 'GB', 'US', 'CA', 'JP', 'SG', 'AE', // Others
] as const;

// Country names come from the Unicode CLDR data embedded in Node.js, not from a hand-written list.
const englishNames = new Intl.DisplayNames(['en-GB'], { type: 'region' });
const frenchNames = new Intl.DisplayNames(['fr-FR'], { type: 'region' });

export const countries = COUNTRY_CODES.map((code) => ({
  code,
  nameEn: englishNames.of(code) ?? code,
  nameFr: frenchNames.of(code) ?? code,
}));

export const currencies = Object.entries(CURRENCY_MINOR_UNITS).map(([code, minorUnits]) => ({
  code,
  minorUnits,
}));

const referenceEntries = [
  ['ASSET_CATEGORY', 'PRIVATE_DEBT', 'Private debt', 'Dette privée'],
  ['ASSET_CATEGORY', 'RENEWABLE_ENERGY', 'Renewable energy', 'Énergies renouvelables'],
  ['ASSET_CATEGORY', 'REAL_ESTATE', 'Real estate', 'Immobilier'],
  ['ASSET_CATEGORY', 'INFRASTRUCTURE', 'Infrastructure', 'Infrastructures'],
  ['ASSET_CATEGORY', 'PRIVATE_EQUITY', 'Private equity', 'Capital-investissement'],
  ['INVESTOR_CLASSIFICATION', 'PROFESSIONAL', 'Professional client', 'Client professionnel'],
  [
    'INVESTOR_CLASSIFICATION',
    'ELIGIBLE_COUNTERPARTY',
    'Eligible counterparty',
    'Contrepartie éligible',
  ],
] as const;

export const referenceData = referenceEntries.map(([category, code, labelEn, labelFr]) => ({
  id: deterministicUuid(`reference-data:${category}:${code}`),
  category,
  code,
  labelEn,
  labelFr,
}));

/** Two tenants: the second one exists to demonstrate isolation (scenario 5). */
export const tenants = [
  {
    id: deterministicUuid('tenant:northwind'),
    legalName: 'Northwind Asset Management SAS (demo)',
    tradeName: 'Northwind AM',
    countryCode: 'FR',
    baseCurrency: 'EUR',
    defaultLocale: 'en-GB',
    timezone: 'Europe/Paris',
    organizationType: 'ASSET_MANAGER',
  },
  {
    id: deterministicUuid('tenant:contoso'),
    legalName: 'Contoso Private Markets S.à r.l. (demo)',
    tradeName: 'Contoso PM',
    countryCode: 'LU',
    baseCurrency: 'EUR',
    defaultLocale: 'en-GB',
    timezone: 'Europe/Luxembourg',
    organizationType: 'ISSUER',
  },
] as const;
