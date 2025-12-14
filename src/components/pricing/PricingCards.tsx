'use client';

import React from 'react';
import { useAuth, useClerk } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { pricingTiers, formatPrice } from '@/lib/pricing';
import { Check } from 'lucide-react';

export function PricingCards() {
  const { isSignedIn } = useAuth();
  const { openSignIn } = useClerk();
  const router = useRouter();
  const [loading, setLoading] = React.useState<string | null>(null);

  const handlePurchase = async (priceId: string) => {
    if (!isSignedIn) {
      openSignIn({ afterSignInUrl: window.location.href });
      return;
    }

    setLoading(priceId);
    
    try {
      const res = await fetch('/api/payments/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId }),
      });

      if (!res.ok) {
        const error = await res.json();
        console.error('Checkout error:', error);
        alert(error.error || 'Failed to create checkout session');
        return;
      }

      const { url } = await res.json();
      if (url) {
        router.push(url);
      }
    } catch (error) {
      console.error('Purchase error:', error);
      alert('Something went wrong. Please try again.');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
      {pricingTiers.map((tier) => (
        <div 
          key={tier.tier}
          className="relative bg-white rounded-2xl border-2 border-gray-200 p-8 shadow-sm hover:shadow-lg hover:bg-linear-to-r hover:from-purple-50 hover:to-pink-50 hover:border-purple-400 transition-all duration-300 flex flex-col"
        >
          {tier.popular && (
            <div className="absolute top-4 right-4">
              <span className="inline-flex items-center rounded-full bg-orange-100 px-3 py-1 text-base font-medium text-orange-800">
                Most Popular
              </span>
            </div>
          )}
          
          <div className="mb-8">
            <h3 className="text-xl font-semibold text-gray-900 mb-4">{tier.label}</h3>
            
            <div className="flex items-baseline">
              <span className="text-4xl font-bold text-gray-900">
                {formatPrice(tier.amount, tier.currency)}
              </span>
              <span className="ml-2 text-gray-600">one-time</span>
            </div>
          </div>
          
          <ul className="space-y-4 mb-8 grow">
            {tier.features?.map((feature, idx) => (
              <li key={idx} className="flex items-start gap-3">
                <div className="shrink-0 w-5 h-5 bg-green-100 rounded-full flex items-center justify-center mt-0.5">
                  <Check className="h-3 w-3 text-green-600" />
                </div>
                <span className="text-gray-700 text-base">{feature}</span>
              </li>
            ))}
          </ul>
          
          <button
            onClick={() => handlePurchase(tier.priceId)}
            disabled={loading === tier.priceId}
            className="w-full bg-linear-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-medium py-3 px-6 rounded-full transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed mt-auto"
          >
            {loading === tier.priceId ? 'Processing...' : 'Buy Now'}
          </button>
        </div>
      ))}
    </div>
  );
}