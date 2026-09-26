'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { parseDecimal } from '@virtus/shared';
import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { ApiError } from '@/components/app/api-error';
import { FormField } from '@/components/app/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Link, useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api/client';
import { useIdempotencyKey } from '@/lib/api/idempotency';

const WHOLE_UNITS = /^\d{1,16}$/;
const PRICE = /^\d{1,20}(\.\d{1,4})?$/;

/**
 * Transfer request (SPEC §11.1, D-010): the recipient is chosen by the code it gave, never from a
 * list. The draft is created (or updated after a refusal), then submitted: the units are blocked
 * until compliance decides.
 */
export function TransferForm({ issuanceId }: { issuanceId: string }) {
  const t = useTranslations('transfers.form');
  const router = useRouter();
  const queryClient = useQueryClient();
  const [recipientCode, setRecipientCode] = useState('');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [draft, setDraft] = useState<{ id: string; version: number } | null>(null);
  const save = useIdempotencyKey();
  const send = useIdempotencyKey();
  const holding = useQuery({
    queryKey: ['positions', 'own', issuanceId],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/positions', {
        params: { query: { issuanceId, pageSize: 1 } },
      });
      if (error) throw error;
      return data.data[0] ?? null;
    },
  });
  const available = holding.data?.quantityAvailable ?? '0';
  const quantityValid =
    WHOLE_UNITS.test(quantity) &&
    parseDecimal(quantity).gt(0) &&
    parseDecimal(quantity).lte(parseDecimal(available));
  const priceValid = price.trim() === '' || PRICE.test(price.trim().replace(',', '.'));

  const saveDraft = async () => {
    const body = {
      recipientCode: recipientCode.trim(),
      quantity,
      indicativePrice: price.trim() ? price.trim().replace(',', '.') : null,
    };
    if (draft) {
      const { data, error } = await api.PATCH('/api/v1/transfers/{id}', {
        params: { path: { id: draft.id } },
        headers: { 'If-Match': `"${draft.version}"` },
        body,
      });
      if (error) throw error;
      return data;
    }
    const { data, error } = await api.POST('/api/v1/transfers', {
      params: { header: save.header() },
      body: { issuanceId, ...body },
    });
    save.answered();
    if (error) throw error;
    return data;
  };
  const request = useMutation({
    mutationFn: async () => {
      const saved = await saveDraft();
      setDraft({ id: saved.id, version: saved.version });
      const { data, error } = await api.POST('/api/v1/transfers/{id}/submit', {
        params: { path: { id: saved.id }, header: send.header() },
      });
      send.answered();
      if (error) throw error;
      return data;
    },
    onSuccess: async (submitted) => {
      await queryClient.invalidateQueries({ queryKey: ['transfers'] });
      await queryClient.invalidateQueries({ queryKey: ['positions'] });
      router.push(`/portal/transfers/${submitted.id}`);
    },
  });

  if (holding.isError) return <ApiError error={holding.error} />;
  if (holding.isPending) return null;
  if (!holding.data) return <p className="text-sm text-muted">{t('noPosition')}</p>;
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (quantityValid && priceValid && recipientCode.trim()) request.mutate();
  };

  return (
    <form className="flex max-w-xl flex-col gap-4" onSubmit={onSubmit} noValidate>
      <p className="text-sm">
        {t('holding', {
          issuance: holding.data.issuanceName,
          available,
          held: holding.data.quantityHeld,
        })}
      </p>
      <FormField label={t('recipientCode')} hint={t('recipientCodeHint')}>
        <Input
          value={recipientCode}
          onChange={(event) => setRecipientCode(event.target.value)}
          autoComplete="off"
          className="w-60 font-mono uppercase"
        />
      </FormField>
      <FormField
        label={t('quantity')}
        error={quantity && !quantityValid ? t('quantityInvalid', { available }) : undefined}
      >
        <Input
          inputMode="numeric"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value.trim())}
          className="w-40"
        />
      </FormField>
      <FormField
        label={t('indicativePrice')}
        hint={t('indicativePriceHint')}
        error={priceValid ? undefined : t('priceInvalid')}
      >
        <Input
          inputMode="decimal"
          value={price}
          onChange={(event) => setPrice(event.target.value)}
          className="w-40"
        />
      </FormField>
      {request.isError ? <ApiError error={request.error} /> : null}
      <div className="flex gap-2">
        <Button
          type="submit"
          disabled={!quantityValid || !priceValid || !recipientCode.trim() || request.isPending}
        >
          {t('submit')}
        </Button>
        <Button asChild variant="secondary">
          <Link href="/portal/portfolio">{t('back')}</Link>
        </Button>
      </div>
    </form>
  );
}
