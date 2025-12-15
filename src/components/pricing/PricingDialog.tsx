'use client';

import React from 'react';
import { useAuth, useClerk } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { pricingTiers, formatPrice } from '@/lib/pricing';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Button } from '@windrun-huaiin/base-ui/ui';

interface CreditPurchaseModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentBalance?: number;
}

export function CreditPurchaseModal({ 
  open,
  onOpenChange,
  currentBalance: _currentBalance = 0
}: CreditPurchaseModalProps) {
  const { isSignedIn } = useAuth();
  const { openSignIn } = useClerk();
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  const [selectedTier, setSelectedTier] = React.useState('Elite');

  const handlePurchase = async () => {
    const tier = pricingTiers.find(t => t.tier === selectedTier);
    if (!tier) return;
    
    const priceId = tier.priceId;

    if (!isSignedIn) {
      openSignIn({ afterSignInUrl: window.location.href });
      return;
    }

    setLoading(true);
    
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
        onOpenChange(false);
        router.push(url);
      }
    } catch (error) {
      console.error('Purchase error:', error);
      alert('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="sm:max-w-md border-0 shadow-2xl overflow-hidden p-0 mt-10" 
        style={{ 
          backgroundColor: '#fafafa',
          borderRadius: '20px'
        }}
      >
        {/* 极简头部 */}
        <div className="px-8 pt-8 pb-4">
          <DialogHeader>
            <div className="text-left mb-4">
              <DialogTitle className="text-2xl font-semibold text-gray-900 mb-1">
                Get more credits
              </DialogTitle>
              <p className="text-gray-600 text-base">
                Continue creating amazing AI narrations
              </p>
            </div>
            <div className="text-gray-600 text-left text-base space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-green-600 font-medium">✓</span>
                <span>One-time purchase, valid for 1 year</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-green-600 font-medium">✓</span>
                <span>No subscription required</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-green-600 font-medium">✓</span>
                <span>Credits activate instantly</span>
              </div>
            </div>
          </DialogHeader>
        </div>

        {/* 极简价格选择区域 */}
        <div className="px-8 pb-4">
          <div className="space-y-4">
            {pricingTiers.map((tier) => (
              <div 
                key={tier.tier}
                className={`
                  relative flex items-center p-4 rounded-2xl cursor-pointer
                  transition-all duration-200 border-2
                  ${selectedTier === tier.tier 
                    ? 'bg-linear-to-r from-purple-50 to-pink-50 border-purple-400 text-gray-900 shadow-sm' 
                    : 'bg-white border-gray-100 hover:border-gray-200 hover:bg-gray-50 text-gray-900'
                  }
                `}
                onClick={() => setSelectedTier(tier.tier)}
              >
                {/* POPULAR 标签 - 显示在边框左边 */}
                {tier.tier === 'Elite' && (
                  <div className="absolute -top-3 left-4 z-10">
                    <span className="text-xs px-3 py-1 rounded-full font-medium bg-linear-to-r from-purple-600 to-pink-600 text-white shadow-md">
                      POPULAR
                    </span>
                  </div>
                )}
                <label className="flex items-center justify-between w-full cursor-pointer">
                  <div className="flex items-center gap-4">
                    {/* 极简单选按钮 */}
                    <input
                      type="radio"
                      name="pricing-tier"
                      value={tier.tier}
                      checked={selectedTier === tier.tier}
                      onChange={() => setSelectedTier(tier.tier)}
                      className="sr-only"
                    />
                    <div className={`
                      w-5 h-5 rounded-full border-2 transition-all duration-200 flex items-center justify-center
                      ${selectedTier === tier.tier 
                        ? 'border-purple-500 bg-purple-500' 
                        : 'border-gray-400 bg-transparent'
                      }
                    `}>
                      {selectedTier === tier.tier && (
                        <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                    
                    {/* 套餐信息 */}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-lg text-gray-900">
                          {tier.label}
                        </span>
                      </div>
                      <div className="text-base mt-0.5 text-gray-500">
                        {tier.credits} credits
                      </div>
                    </div>
                  </div>
                  
                  {/* 价格 */}
                  <div className="text-right">
                    <div className="text-2xl font-bold text-gray-900">
                      {formatPrice(tier.amount, tier.currency)}
                    </div>
                    <div className="text-sm text-gray-500 tracking-wide">
                      one-time
                    </div>
                  </div>
                </label>
              </div>
            ))}
          </div>

          {/* 积分说明 */}
          <div className="mt-4 text-center">
            <p className="text-sm text-gray-500">
              1 credit = 1 image narration
            </p>
          </div>
        </div>

        {/* 底部区域 */}
        <div className="px-8 pb-8 pt-2">
          {/* 极简购买按钮 */}
          <Button
            className="w-full h-12 text-base font-medium bg-linear-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-lg transition-all duration-200 flex items-center justify-center"
            onClick={handlePurchase}
            disabled={loading}
            style={{ borderRadius: '12px' }}
          >
            {loading ? 'Processing...' : 'Buy Now'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// 保持向后兼容性
export function PricingContent({ 
  currentBalance = 0,
  onClose
}: {
  currentBalance?: number;
  onClose?: () => void;
}) {
  return (
    <div className="p-4">
      <div className="text-center mb-4">
        <div className="text-sm text-muted-foreground">
          Current balance: <span className="font-semibold text-foreground">{currentBalance}</span> credits
        </div>
      </div>
      <div className="text-center text-sm text-muted-foreground">
        This component has been replaced with CreditPurchaseModal. Please use the new modal component.
      </div>
      {onClose && (
        <div className="text-center mt-4">
          <Button onClick={onClose} variant="outline">
            Close
          </Button>
        </div>
      )}
    </div>
  );
}