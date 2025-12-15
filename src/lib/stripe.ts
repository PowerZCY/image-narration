import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is not configured');
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-11-17.clover',
  typescript: true,
});

export const stripeConfig = {
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  priceIds: {
    starter: process.env.NEXT_PUBLIC_STRIPE_PRICE_STARTER || '',
    pro: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO || '',
    elite: process.env.NEXT_PUBLIC_STRIPE_PRICE_ELITE || '',
  },
};

export function validateWebhookSignature(
  payload: string | Buffer,
  signature: string
): Stripe.Event {
  if (!stripeConfig.webhookSecret) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
  }

  return stripe.webhooks.constructEvent(
    payload,
    signature,
    stripeConfig.webhookSecret
  );
}

export function isValidPriceId(priceId: string): boolean {
  return Object.values(stripeConfig.priceIds).includes(priceId);
}