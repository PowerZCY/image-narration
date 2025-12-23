import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { UsageHistoryClient } from './usage-history-client';
import { getAsNeededLocalizedUrl } from '@windrun-huaiin/lib';

export default async function UsageHistoryPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const { userId } = await auth();
  
  // 检查用户是否已登录，未登录重定向到登录页面
  if (!userId) {
    const signPath = getAsNeededLocalizedUrl(locale, '/sign-in');
    const activityPath = getAsNeededLocalizedUrl(locale, '/activity');
    redirect(`${signPath}?redirect=${encodeURIComponent(`${activityPath}`)}`);
  }

  // 获取翻译
  const t = await getTranslations({ locale, namespace: 'activity' });

  return (
    <div className="flex-1 container mt-15 mx-auto px-4 py-8 max-w-4xl min-h-[90vh]">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          {t('title')}
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          {t('description')}
        </p>
      </div>
      
      <UsageHistoryClient 
        clerkUserId={userId}
        translations={{
          loading: t('loading'),
          error: t('error'),
          noData: t('noData'),
          noDataDescription: t('noDataDescription'),
          loadMore: t('loadMore'),
          copy: t('copy'),
          copied: t('copied'),
          prompt: t('prompt'),
          narration: t('narration'),
          createdAt: t('createdAt'),
          showMore: t('showMore'),
          showLess: t('showLess'),
          noPrompt: t('noPrompt'),
          delete: t('delete'),
          deleteConfirm: t('deleteConfirm'),
          deleting: t('deleting'),
          deleteSuccess: t('deleteSuccess'),
          deleteError: t('deleteError'),
          cancel: t('cancel'),
          retry: t('retry')
        }}
      />
    </div>
  );
}
