'use client';

import { LogOut } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api/client';

export function SignOutButton() {
  const t = useTranslations('auth');
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await api.POST('/api/v1/auth/sign-out');
        router.replace('/login');
        router.refresh();
      }}
    >
      <LogOut aria-hidden="true" />
      {t('signOut')}
    </Button>
  );
}
