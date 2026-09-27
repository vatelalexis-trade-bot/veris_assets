'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NotificationCategory } from '@veris/shared';
import { useTranslations } from 'next-intl';
import { Dialog } from 'radix-ui';
import { useState } from 'react';
import { ApiError } from '@/components/app/api-error';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { api } from '@/lib/api/client';

interface Preference {
  category: NotificationCategory;
  inApp: boolean;
  email: boolean;
  mandatory: boolean;
}

/** Channels per category (SPEC §15): security and workflow notifications stay on. */
export function NotificationPreferences({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('notifications');
  const tCommon = useTranslations('common');
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Preference[] | null>(null);
  const preferences = useQuery({
    queryKey: ['notifications', 'preferences'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/notifications/preferences');
      if (error) throw error;
      return data;
    },
    enabled: open,
  });
  const rows = draft ?? preferences.data ?? [];
  const save = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.PUT('/api/v1/notifications/preferences', {
        body: {
          preferences: rows
            .filter((row) => !row.mandatory)
            .map(({ category, inApp, email }) => ({ category, inApp, email })),
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(['notifications', 'preferences'], saved);
      onOpenChange(false);
    },
  });
  const change = (category: NotificationCategory, channel: 'inApp' | 'email', value: boolean) =>
    setDraft(rows.map((row) => (row.category === category ? { ...row, [channel]: value } : row)));

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        setDraft(null);
        save.reset();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-background/80" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 flex w-[min(92vw,32rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-xl border border-border bg-surface p-6">
          <Dialog.Title className="text-lg font-semibold">{t('preferences.title')}</Dialog.Title>
          <Dialog.Description className="text-sm text-muted">
            {t('preferences.description')}
          </Dialog.Description>
          {preferences.isError ? <ApiError error={preferences.error} /> : null}
          <table className="w-full text-sm">
            <caption className="sr-only">{t('preferences.title')}</caption>
            <thead>
              <tr className="text-left text-muted">
                <th scope="col" className="py-1 font-medium">
                  {t('preferences.category')}
                </th>
                <th scope="col" className="py-1 text-center font-medium">
                  {t('preferences.inApp')}
                </th>
                <th scope="col" className="py-1 text-center font-medium">
                  {t('preferences.email')}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const label = t(`categories.${row.category}`);
                return (
                  <tr key={row.category} className="border-t border-border">
                    <th scope="row" className="py-2 text-left font-normal">
                      {label}
                      {row.mandatory ? (
                        <span className="block text-xs text-muted">
                          {t('preferences.mandatory')}
                        </span>
                      ) : null}
                    </th>
                    {(['inApp', 'email'] as const).map((channel) => (
                      <td key={channel} className="py-2 text-center">
                        <Checkbox
                          aria-label={`${label} — ${t(`preferences.${channel}`)}`}
                          checked={row[channel]}
                          disabled={row.mandatory}
                          onChange={(event) => change(row.category, channel, event.target.checked)}
                        />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {save.isError ? <ApiError error={save.error} /> : null}
          <div className="flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button variant="secondary">{tCommon('cancel')}</Button>
            </Dialog.Close>
            <Button disabled={save.isPending || rows.length === 0} onClick={() => save.mutate()}>
              {tCommon('save')}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
