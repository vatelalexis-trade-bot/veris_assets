'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notificationText, type NotificationType } from '@veris/shared';
import { Bell } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { Popover } from 'radix-ui';
import { useState } from 'react';
import { ApiError } from '@/components/app/api-error';
import { Button } from '@/components/ui/button';
import type { AppLocale } from '@/i18n/routing';
import { api } from '@/lib/api/client';
import { cn } from '@/lib/utils';
import { NotificationPreferences } from './notification-preferences';

/** The unread count is refreshed every 30 seconds while the page is open. */
const REFRESH_INTERVAL_MS = 30_000;
const LATEST = 10;

/** Bell of the header (SPEC §15, §23.2): unread count, latest notifications, preferences. */
export function NotificationBell() {
  const t = useTranslations('notifications');
  const locale = useLocale() as AppLocale;
  const format = useFormatter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);

  const unread = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/notifications/unread-count');
      if (error) throw error;
      return data.count;
    },
    refetchInterval: REFRESH_INTERVAL_MS,
  });
  const latest = useQuery({
    queryKey: ['notifications', 'latest'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/notifications', {
        params: { query: { pageSize: LATEST } },
      });
      if (error) throw error;
      return data.data;
    },
    enabled: open,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['notifications'] });
  const markRead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.POST('/api/v1/notifications/{id}/read', {
        params: { path: { id } },
      });
      if (error) throw error;
    },
    onSuccess: refresh,
  });
  const markAllRead = useMutation({
    mutationFn: async () => {
      const { error } = await api.POST('/api/v1/notifications/read-all');
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  const count = unread.data ?? 0;
  return (
    <>
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            aria-label={count > 0 ? t('bellUnread', { count }) : t('bell')}
          >
            <Bell aria-hidden="true" />
            {count > 0 ? (
              <span
                aria-hidden="true"
                className="absolute top-1 right-1 min-w-4 rounded-full bg-accent px-1 text-center text-[10px] leading-4 font-semibold text-background"
              >
                {count > 99 ? '99+' : count}
              </span>
            ) : null}
          </Button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="end"
            sideOffset={8}
            className="z-50 flex w-[min(92vw,24rem)] flex-col gap-3 rounded-xl border border-border bg-surface p-4 shadow-lg"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-heading font-semibold">{t('title')}</h2>
              <Button
                variant="link"
                size="sm"
                disabled={count === 0 || markAllRead.isPending}
                onClick={() => markAllRead.mutate()}
              >
                {t('markAllRead')}
              </Button>
            </div>
            {latest.isError ? <ApiError error={latest.error} /> : null}
            {latest.data && latest.data.length === 0 ? (
              <p className="text-sm text-muted">{t('empty')}</p>
            ) : null}
            <ul className="flex max-h-96 flex-col divide-y divide-border overflow-y-auto">
              {(latest.data ?? []).map((item) => {
                const text = notificationText(item.type as NotificationType, locale, item.params);
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={cn(
                        'flex w-full flex-col gap-1 py-2 text-left text-sm',
                        item.readAt ? 'text-muted' : 'text-foreground',
                      )}
                      onClick={() => (item.readAt ? undefined : markRead.mutate(item.id))}
                    >
                      <span className="flex items-center gap-2 font-medium">
                        {item.readAt ? null : (
                          <span aria-hidden="true" className="size-2 rounded-full bg-accent" />
                        )}
                        {text.title}
                        {item.readAt ? null : <span className="sr-only">{t('unread')}</span>}
                      </span>
                      <span>{text.body}</span>
                      <span className="text-xs text-muted">
                        {format.relativeTime(new Date(item.createdAt))}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <Button
              variant="secondary"
              size="sm"
              className="self-start"
              onClick={() => {
                // The preferences open in their own dialog, once the list is closed.
                setOpen(false);
                setPreferencesOpen(true);
              }}
            >
              {t('preferences.open')}
            </Button>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      <NotificationPreferences open={preferencesOpen} onOpenChange={setPreferencesOpen} />
    </>
  );
}
