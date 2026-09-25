'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog } from 'radix-ui';
import { useFormatter, useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { ApiError } from '@/components/app/api-error';
import { ConfirmDialog } from '@/components/app/confirm-dialog';
import { DataTable } from '@/components/app/data-table';
import { FormField } from '@/components/app/form-field';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { LocaleSelect } from '@/features/tenants/tenant-fields';
import { api } from '@/lib/api/client';
import { useIdempotencyKey } from '@/lib/api/idempotency';
import type { operations } from '@/lib/api/schema';

type UserView = operations['UsersController_get']['responses'][200]['content']['application/json'];
type RoleCode = UserView['roles'][number];

/** Roles an Issuer Administrator gives to the staff of the organisation (SPEC §4.2 to §4.6). */
const STAFF_ROLES: RoleCode[] = [
  'ISSUER_ADMIN',
  'ISSUER_OPERATOR',
  'COMPLIANCE_OFFICER',
  'AUDITOR',
];

interface Rights {
  /** user:manage — invite, deactivate, reactivate. */
  canManage: boolean;
  /** role:assign — change roles. */
  canAssignRoles: boolean;
}

/** Users of the organisation, invitations and pending invitations. */
export function UsersPanel({ currentUserId, rights }: { currentUserId: string; rights: Rights }) {
  const t = useTranslations();
  const format = useFormatter();
  const queryClient = useQueryClient();
  const users = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/users');
      if (error) throw error;
      return data;
    },
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['users'] });

  const statusKey = useIdempotencyKey();
  const setStatus = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'deactivate' | 'reactivate' }) => {
      const path =
        action === 'deactivate' ? '/api/v1/users/{id}/deactivate' : '/api/v1/users/{id}/reactivate';
      const { error } = await api.POST(path, {
        params: { path: { id }, header: statusKey.header() },
      });
      statusKey.answered();
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  return (
    <div className="flex flex-col gap-6">
      {users.isError ? <ApiError error={users.error} /> : null}
      {setStatus.isError ? <ApiError error={setStatus.error} /> : null}
      <DataTable<UserView>
        caption={t('users.caption')}
        loading={users.isPending}
        rows={users.data ?? []}
        getRowId={(row) => row.id}
        columns={[
          { id: 'name', header: t('users.columns.name'), cell: (row) => row.name },
          { id: 'email', header: t('users.columns.email'), cell: (row) => row.email },
          {
            id: 'roles',
            header: t('users.columns.roles'),
            cell: (row) => row.roles.map((role) => t(`auth.roles.${role}`)).join(', '),
          },
          {
            id: 'status',
            header: t('users.columns.status'),
            cell: (row) => t(`common.userStatus.${row.status}`),
          },
          {
            id: 'mfa',
            header: t('users.columns.mfa'),
            cell: (row) => (row.mfaEnabled ? t('users.mfaOn') : t('users.mfaOff')),
          },
          {
            id: 'lastLogin',
            header: t('users.columns.lastLogin'),
            cell: (row) =>
              row.lastLoginAt
                ? format.dateTime(new Date(row.lastLoginAt), {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })
                : t('common.never'),
          },
          {
            id: 'actions',
            header: t('common.actions'),
            cell: (row) =>
              row.id === currentUserId || !(rights.canManage || rights.canAssignRoles) ? null : (
                <div className="flex gap-2">
                  {rights.canAssignRoles && !row.roles.includes('INVESTOR') ? (
                    <RolesDialog user={row} onSaved={refresh} />
                  ) : null}
                  {rights.canManage ? (
                    <ConfirmDialog
                      trigger={
                        <Button size="sm" variant={row.status === 'ACTIVE' ? 'ghost' : 'secondary'}>
                          {row.status === 'ACTIVE' ? t('users.deactivate') : t('users.reactivate')}
                        </Button>
                      }
                      title={t(
                        row.status === 'ACTIVE' ? 'users.deactivateTitle' : 'users.reactivateTitle',
                        { name: row.name },
                      )}
                      description={t(
                        row.status === 'ACTIVE'
                          ? 'users.deactivateDescription'
                          : 'users.reactivateDescription',
                        {
                          name: row.name,
                        },
                      )}
                      confirmLabel={
                        row.status === 'ACTIVE' ? t('users.deactivate') : t('users.reactivate')
                      }
                      destructive={row.status === 'ACTIVE'}
                      onConfirm={() =>
                        setStatus.mutateAsync({
                          id: row.id,
                          action: row.status === 'ACTIVE' ? 'deactivate' : 'reactivate',
                        })
                      }
                    />
                  ) : null}
                </div>
              ),
          },
        ]}
      />
      {rights.canManage ? <InviteUserForm /> : null}
      <PendingInvitations />
    </div>
  );
}

function RolesDialog({ user, onSaved }: { user: UserView; onSaved: () => unknown }) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [roles, setRoles] = useState<RoleCode[]>(user.roles);
  const idempotency = useIdempotencyKey();
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await api.PUT('/api/v1/users/{id}/roles', {
        params: { path: { id: user.id }, header: idempotency.header() },
        body: { roles },
      });
      idempotency.answered();
      if (error) throw error;
    },
    onSuccess: async () => {
      await onSaved();
      setOpen(false);
    },
  });
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setRoles(user.roles);
      }}
    >
      <Dialog.Trigger asChild>
        <Button size="sm" variant="secondary">
          {t('users.roles.edit')}
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-background/80" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 flex w-[min(92vw,28rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-xl border border-border bg-surface p-6">
          <Dialog.Title className="text-lg font-semibold">
            {t('users.roles.title', { name: user.name })}
          </Dialog.Title>
          <Dialog.Description className="text-sm text-muted">
            {t('users.roles.help')}
          </Dialog.Description>
          <fieldset className="flex flex-col gap-2">
            <legend className="sr-only">{t('users.columns.roles')}</legend>
            {STAFF_ROLES.map((role) => (
              <label key={role} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={roles.includes(role)}
                  onChange={(event) =>
                    setRoles(
                      event.target.checked
                        ? [...roles, role]
                        : roles.filter((candidate) => candidate !== role),
                    )
                  }
                />
                {t(`auth.roles.${role}`)}
              </label>
            ))}
          </fieldset>
          {save.isError ? <ApiError error={save.error} /> : null}
          <div className="flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button variant="secondary">{t('common.cancel')}</Button>
            </Dialog.Close>
            <Button disabled={save.isPending || roles.length === 0} onClick={() => save.mutate()}>
              {t('users.roles.save')}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function InviteUserForm() {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [invitee, setInvitee] = useState({
    name: '',
    email: '',
    roleCode: 'ISSUER_OPERATOR' as RoleCode,
    locale: 'en-GB' as 'en-GB' | 'fr-FR',
  });
  const idempotency = useIdempotencyKey();
  const invite = useMutation({
    mutationFn: async () => {
      const { error } = await api.POST('/api/v1/users/invitations', {
        params: { header: idempotency.header() },
        body: invitee,
      });
      idempotency.answered();
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['invitations'] }),
  });
  return (
    <form
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        invite.mutate();
      }}
      className="grid max-w-2xl gap-4 rounded-xl border border-border bg-surface p-5 md:grid-cols-2"
      noValidate
    >
      <h2 className="font-heading font-semibold md:col-span-2">{t('users.invite.title')}</h2>
      <FormField label={t('tenants.form.adminName')}>
        <Input
          value={invitee.name}
          onChange={(event) => setInvitee({ ...invitee, name: event.target.value })}
        />
      </FormField>
      <FormField label={t('tenants.form.adminEmail')}>
        <Input
          type="email"
          value={invitee.email}
          onChange={(event) => setInvitee({ ...invitee, email: event.target.value })}
        />
      </FormField>
      <FormField label={t('users.invite.role')}>
        <Select
          value={invitee.roleCode}
          onChange={(event) => setInvitee({ ...invitee, roleCode: event.target.value as RoleCode })}
        >
          {STAFF_ROLES.map((role) => (
            <option key={role} value={role}>
              {t(`auth.roles.${role}`)}
            </option>
          ))}
        </Select>
      </FormField>
      <FormField label={t('tenants.form.adminLocale')}>
        <LocaleSelect
          value={invitee.locale}
          onChange={(event) =>
            setInvitee({ ...invitee, locale: event.target.value as 'en-GB' | 'fr-FR' })
          }
        />
      </FormField>
      <div className="flex flex-col gap-2 md:col-span-2">
        {invite.isError ? <ApiError error={invite.error} /> : null}
        {invite.isSuccess ? (
          <p role="status" className="text-sm text-success">
            {t('users.invite.sent', { email: invitee.email })}
          </p>
        ) : null}
        <Button
          type="submit"
          className="self-start"
          disabled={invite.isPending || !invitee.name || !invitee.email}
        >
          {t('users.invite.submit')}
        </Button>
      </div>
    </form>
  );
}

function PendingInvitations() {
  const t = useTranslations();
  const format = useFormatter();
  const invitations = useQuery({
    queryKey: ['invitations'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/users/invitations');
      if (error) throw error;
      return data;
    },
  });
  return (
    <section aria-labelledby="pending-invitations" className="flex max-w-2xl flex-col gap-2">
      <h2 id="pending-invitations" className="font-heading font-semibold">
        {t('users.pending.title')}
      </h2>
      {invitations.data && invitations.data.length === 0 ? (
        <p className="text-sm text-muted">{t('users.pending.none')}</p>
      ) : null}
      <ul className="flex flex-col divide-y divide-border text-sm">
        {(invitations.data ?? []).map((invitation) => (
          <li key={invitation.id} className="flex flex-wrap justify-between gap-2 py-2">
            <span>
              {invitation.name} · {invitation.email} · {t(`auth.roles.${invitation.roleCode}`)}
            </span>
            <span className="text-muted">
              {t('users.pending.expires', {
                date: format.dateTime(new Date(invitation.expiresAt), { dateStyle: 'medium' }),
              })}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
