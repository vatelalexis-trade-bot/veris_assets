'use client';

import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ApiError } from '@/components/app/api-error';
import { Select } from '@/components/ui/select';
import { usePathname, useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api/client';
import type { CorrectionRights } from './corrections';
import { RegistryView } from './registry-view';

const WITH_REGISTRY = ['ALLOCATED', 'ACTIVE', 'MATURED'];

/** The registry of the organisation, issuance by issuance (the choice is kept in the URL). */
export function RegistryPage({ corrections }: { corrections: CorrectionRights }) {
  const t = useTranslations('registry');
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const issuances = useQuery({
    queryKey: ['issuances', 'with-registry'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/issuances', {
        params: { query: { pageSize: 100 } },
      });
      if (error) throw error;
      return data.data.filter((row) => WITH_REGISTRY.includes(row.status));
    },
  });
  const choices = issuances.data ?? [];
  const selected = choices.find((row) => row.id === params.get('issuanceId')) ?? choices[0];

  if (issuances.isError) return <ApiError error={issuances.error} />;
  if (issuances.isPending) return null;
  if (!selected) return <p className="text-sm text-muted">{t('noIssuance')}</p>;
  return (
    <div className="flex flex-col gap-4">
      <Select
        aria-label={t('issuance')}
        value={selected.id}
        className="w-80"
        onChange={(event) => router.replace(`${pathname}?issuanceId=${event.target.value}`)}
      >
        {choices.map((row) => (
          <option key={row.id} value={row.id}>
            {row.name} ({row.code})
          </option>
        ))}
      </Select>
      <RegistryView
        key={selected.id}
        issuanceId={selected.id}
        totalUnits={selected.terms.totalUnits}
        corrections={corrections}
      />
    </div>
  );
}
