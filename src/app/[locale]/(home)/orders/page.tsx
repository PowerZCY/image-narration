import { getTranslations, setRequestLocale } from 'next-intl/server';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { OrdersList } from '@/components/orders/OrdersList';

export default async function OrdersPage({ 
  params 
}: { 
  params: Promise<{ locale: string }> 
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  
  // 检查用户认证状态
  const { userId: clerkUserId } = await auth();
  
  if (!clerkUserId) {
    redirect(`/${locale}/sign-in`);
  }

  const t = await getTranslations({ locale, namespace: 'orders' });

  return (
    <main className="flex-1">
      <div className="container mt-15 mx-auto px-4 py-8 max-w-4xl min-h-[90vh]">
        {/* 页面标题 */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            {t('pageTitle')}
          </h1>
          <p className="text-gray-600">
            {t('pageDescription')}
          </p>
        </div>

        {/* 订单列表 */}
        <OrdersList locale={locale} />
      </div>
    </main>
  );
}
