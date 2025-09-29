export interface PricingTier {
  tier: 'Starter' | 'Pro' | 'Elite';
  label: string;
  priceId: string;
  credits: number;
  amount: number;
  currency: string;
  features?: string[];
  popular?: boolean;
}

export const pricingTiers: PricingTier[] = [
  {
    tier: 'Starter',
    label: 'Starter',
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_STARTER || '',
    credits: 10,
    amount: 2,
    currency: 'usd',
    features: [
      '10 credits',
      'Credits valid for 1 year',
    ],
  },
  {
    tier: 'Pro',
    label: 'Pro',
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO || '',
    credits: 40,
    amount: 5,
    currency: 'usd',
    features: [
      '40 credits',
      'Credits valid for 1 year',
      'Priority support',
    ],
  },
  {
    tier: 'Elite',
    label: 'Elite',
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_ELITE || '',
    credits: 100,
    amount: 10,
    currency: 'usd',
    popular: true,
    features: [
      '100 credits',
      'Credits valid for 1 year',
      'Priority support',
    ],
  },
];

export function getTierByPriceId(priceId: string): PricingTier | undefined {
  return pricingTiers.find((tier) => tier.priceId === priceId);
}

export function formatPrice(amount: number, currency: string = 'usd'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}