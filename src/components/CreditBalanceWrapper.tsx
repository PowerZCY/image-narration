import { getTranslations } from 'next-intl/server';
import { CreditBalance } from './CreditBalance';

interface CreditBalanceWrapperProps {
  locale: string;
}

export async function CreditBalanceWrapper({ locale }: CreditBalanceWrapperProps) {
  const t = await getTranslations({ locale, namespace: 'credits' });
  
  const translations = {
    credits: t('balance'),
    expiresAt: t('expiresAt'),
    buyMore: t('buyMore'),
    noExpiry: t('noExpiry'),
  };

  return <CreditBalance translations={translations} />;
}