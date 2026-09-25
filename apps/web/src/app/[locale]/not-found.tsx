import { SearchX } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { EmptyState } from '@/components/app/empty-state';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';

export default function NotFound() {
  const t = useTranslations();
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl items-center px-6">
      <EmptyState
        icon={SearchX}
        title={t('notFound.title')}
        description={t('notFound.description')}
        action={
          <Button asChild variant="secondary">
            <Link href="/">{t('common.backToHome')}</Link>
          </Button>
        }
        className="w-full"
      />
    </main>
  );
}
