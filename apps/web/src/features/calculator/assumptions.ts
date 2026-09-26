// Every assumption of the business case calculator (SPEC §19, docs/ARCHITECTURE.md §5.7), in one
// place. The visitor sees them and can change them on the page; the values below are only the
// starting point. Amounts in euros, rates as fractions ("0.6" = 60 %), all as exact decimals.

export interface CalculatorInputs {
  /** Nominal amount of the issuance. */
  issuanceVolume: string;
  investors: string;
  subscriptionsPerYear: string;
  transfersPerYear: string;
  distributionsPerYear: string;
  /** Average manual time of one operation, in hours. */
  hoursPerOperation: string;
  hourlyCost: string;
  toolsCost: string;
  providersCost: string;
  incidentsCost: string;
}

export interface CalculatorAssumptions {
  /** Share of the manual time the platform saves. */
  timeSavingRate: string;
  /** Share of the current tools (spreadsheets, registry software) the platform replaces. */
  toolsReduction: string;
  /** Share of the current providers' fees (registrar, paying agent) the platform replaces. */
  providersReduction: string;
  /** Share of the incidents and reconciliations avoided. */
  incidentsReduction: string;
  /** Annual subscription of the platform. */
  platformAnnualFee: string;
  /** Variable cost, as a fraction of the issuance volume per year ("0.0005" = 0.05 %). */
  platformVolumeRate: string;
}

export const DEFAULT_INPUTS: CalculatorInputs = {
  issuanceVolume: '25000000',
  investors: '40',
  subscriptionsPerYear: '60',
  transfersPerYear: '12',
  distributionsPerYear: '4',
  hoursPerOperation: '2.5',
  hourlyCost: '85',
  toolsCost: '18000',
  providersCost: '45000',
  incidentsCost: '12000',
};

export const DEFAULT_ASSUMPTIONS: CalculatorAssumptions = {
  timeSavingRate: '0.6',
  toolsReduction: '0.5',
  providersReduction: '0.3',
  incidentsReduction: '0.5',
  platformAnnualFee: '24000',
  platformVolumeRate: '0.0005',
};
