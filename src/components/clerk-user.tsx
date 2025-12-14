import { getTranslations } from 'next-intl/server';
import { auth } from '@clerk/nextjs/server';
import { supabase } from '@/lib/supabase';
import { ClerkUserClient } from './clerk-user-client';
import { CreditBalanceWrapper } from './CreditBalanceWrapper';

interface ClerkUserProps {
  locale: string;
  // default as true, 'cause Clerk direct is not well, so just use model for sign-in/sign-up
  clerkAuthInModal?: boolean;
  showSignUp?: boolean;
}

interface ClerkUserData {
  signIn: string;
  signUp: string;
  signUpBonus: string;
  signUpBonusTooltip: string;
  terms: string;
  privacy: string;
  orders: string;
  locale: string;
  clerkAuthInModal: boolean;
  showSignUp: boolean;
  hasPaidOrders: boolean;
}

export async function DClerkUser({ 
  locale, 
  clerkAuthInModal = true,
  showSignUp = true
}: ClerkUserProps) {
  const t = await getTranslations({ locale, namespace: 'clerk' });
  const t2 = await getTranslations({ locale, namespace: 'footer' });
  
  // 检查用户付费状态
  const { userId: clerkUserId } = await auth();
  let hasPaidOrders = false;
  
  if (clerkUserId) {
    const { data: userOverview } = await supabase
      .schema(process.env.SUPABASE_SCHEMA!)
      .from('user_credits_overview')
      .select('paid_orders_count')
      .eq('clerk_user_id', clerkUserId)
      .single();
    
    hasPaidOrders = userOverview?.paid_orders_count ? userOverview.paid_orders_count > 0 : false;
  }
  
  const data: ClerkUserData = {
    signIn: t('signIn'),
    signUp: t('signUp'),
    signUpBonus: t('signUpBonus'),
    signUpBonusTooltip: t('signUpBonusTooltip'),
    terms: t2('terms'),
    privacy: t2('privacy'),
    orders: t('orders'),
    locale,
    clerkAuthInModal,
    showSignUp,
    hasPaidOrders
  };

  return (
    <div className="flex! items-center gap-2" data-user-area-wrapper suppressHydrationWarning>
      {clerkUserId && <CreditBalanceWrapper locale={locale} />}
      <ClerkUserClient data={data} />
    </div>
  );
}