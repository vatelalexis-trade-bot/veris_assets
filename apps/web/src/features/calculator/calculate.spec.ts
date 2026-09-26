import { describe, expect, it } from 'vitest';
import { DEFAULT_ASSUMPTIONS, DEFAULT_INPUTS } from './assumptions';
import { calculate, readDecimal } from './calculate';

describe('business case calculator (SPEC §19)', () => {
  it('estimates the costs and savings of the default case, in exact decimals', () => {
    // 60 subscriptions + 12 transfers + 4 distributions × 40 investors = 232 operations,
    // × 2.5 h = 580 h × 85 € = 49 300 €, plus tools, providers and incidents.
    expect(calculate(DEFAULT_INPUTS, DEFAULT_ASSUMPTIONS)).toEqual({
      operationsPerYear: '232',
      currentAnnualCost: '124300.00',
      hoursSaved: '348',
      savings: {
        time: '29580.00',
        tools: '9000.00',
        providers: '13500.00',
        incidents: '6000.00',
        total: '58080.00',
      },
      // 24 000 € + 0.05 % of 25 000 000 €.
      platformCost: '36500.00',
      netSavings: '21580.00',
      costWithPlatform: '102720.00',
      returnOnInvestment: '0.5912',
      paybackMonths: '7.5',
    });
  });

  it('never adds floating-point errors', () => {
    const result = calculate(
      {
        ...DEFAULT_INPUTS,
        hoursPerOperation: '0.1',
        subscriptionsPerYear: '3',
        transfersPerYear: '0',
        distributionsPerYear: '0',
        hourlyCost: '0.2',
        toolsCost: '0',
        providersCost: '0',
        incidentsCost: '0',
      },
      DEFAULT_ASSUMPTIONS,
    );
    // 3 × 0.1 × 0.2 = 0.06 exactly (0.30000000000000004 in floating point).
    expect(result!.currentAnnualCost).toBe('0.06');
  });

  it('shows negative net savings when the platform costs more than it saves', () => {
    const result = calculate(DEFAULT_INPUTS, {
      ...DEFAULT_ASSUMPTIONS,
      platformAnnualFee: '100000',
    });
    expect(result!.netSavings).toBe('-54420.00');
    expect(result!.returnOnInvestment!.startsWith('-')).toBe(true);
  });

  it('has no result while a value is missing or invalid', () => {
    expect(calculate({ ...DEFAULT_INPUTS, investors: '' }, DEFAULT_ASSUMPTIONS)).toBeNull();
    expect(calculate({ ...DEFAULT_INPUTS, investors: '-3' }, DEFAULT_ASSUMPTIONS)).toBeNull();
    expect(calculate(DEFAULT_INPUTS, { ...DEFAULT_ASSUMPTIONS, timeSavingRate: 'abc' })).toBeNull();
  });

  it('reads the numbers as visitors type them', () => {
    expect(readDecimal('1 250,50')!.toString()).toBe('1250.5');
    expect(readDecimal('25 000 000')!.toString()).toBe('25000000');
    expect(readDecimal('1e9')).toBeNull();
  });
});
