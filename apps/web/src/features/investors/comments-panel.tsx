'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { ApiError } from '@/components/app/api-error';
import { FormField } from '@/components/app/form-field';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api/client';

/** Compliance comments on an investor (SPEC §4.4): kept for ever, never edited. */
export function CommentsPanel({
  investorId,
  canComment,
}: {
  investorId: string;
  canComment: boolean;
}) {
  const t = useTranslations('investors.comments');
  const format = useFormatter();
  const queryClient = useQueryClient();
  const [body, setBody] = useState('');
  const comments = useQuery({
    queryKey: ['investor', investorId, 'comments'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/investors/{id}/comments', {
        params: { path: { id: investorId } },
      });
      if (error) throw error;
      return data;
    },
  });
  const add = useMutation({
    mutationFn: async () => {
      const { error } = await api.POST('/api/v1/investors/{id}/comments', {
        params: { path: { id: investorId } },
        body: { body: body.trim() },
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      setBody('');
      await queryClient.invalidateQueries({ queryKey: ['investor', investorId, 'comments'] });
    },
  });
  return (
    <section
      aria-labelledby="comments-title"
      className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5"
    >
      <h2 id="comments-title" className="font-heading text-lg font-semibold">
        {t('title')}
      </h2>
      {comments.isError ? <ApiError error={comments.error} /> : null}
      {comments.data?.length === 0 ? <p className="text-sm text-muted">{t('none')}</p> : null}
      <ul className="flex flex-col gap-3 text-sm">
        {(comments.data ?? []).map((comment) => (
          <li key={comment.id} className="rounded-lg border border-border p-3">
            <p className="whitespace-pre-wrap">{comment.body}</p>
            <p className="mt-1 text-xs text-muted">
              {format.dateTime(new Date(comment.createdAt), {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </p>
          </li>
        ))}
      </ul>
      {canComment ? (
        <form
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            add.mutate();
          }}
          className="flex flex-col gap-2"
        >
          <FormField label={t('new')}>
            <Textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              maxLength={4000}
            />
          </FormField>
          {add.isError ? <ApiError error={add.error} /> : null}
          <Button
            type="submit"
            variant="secondary"
            className="self-start"
            disabled={!body.trim() || add.isPending}
          >
            {t('add')}
          </Button>
        </form>
      ) : null}
    </section>
  );
}
