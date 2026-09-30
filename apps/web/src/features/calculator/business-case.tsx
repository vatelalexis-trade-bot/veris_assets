import { Building2, Wallet } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Tabs } from '@/components/ui/tabs';
import { Calculator } from './calculator';
import { InvestorCalculator } from './investor-calculator';

/** The two simulations of the public site: savings for an issuer, coupons for an investor. */
export async function BusinessCase() {
  const t = await getTranslations('calculator');
  return (
    <Tabs
      label={t('tabs.label')}
      items={[
        {
          value: 'issuer',
          label: (
            <span className="flex items-center gap-2">
              <Building2 aria-hidden="true" className="size-4" />
              {t('tabs.issuer')}
            </span>
          ),
          content: <Calculator />,
        },
        {
          value: 'investor',
          label: (
            <span className="flex items-center gap-2">
              <Wallet aria-hidden="true" className="size-4" />
              {t('tabs.investor')}
            </span>
          ),
          content: <InvestorCalculator />,
        },
      ]}
    />
  );
}
