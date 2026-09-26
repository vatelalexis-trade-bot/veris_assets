import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ErrorState } from '@/components/app/error-state';
import { PageHeader } from '@/components/app/page-header';
import { userPermissions } from '@/features/auth/require-permission';
import { TasksQueue } from '@/features/reporting/tasks-queue';

export default async function TasksQueuePage({ params }: PageProps<'/[locale]/issuer/tasks'>) {
  const { locale } = await params;
  setRequestLocale(locale);
  const permissions = await userPermissions();
  if (!permissions['task:read']) return <ErrorState code="PERMISSION_DENIED" />;
  const t = await getTranslations('reporting.tasks');
  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      <TasksQueue />
    </>
  );
}
