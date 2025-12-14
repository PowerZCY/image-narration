'use client';

import React from 'react';
import useSWR from 'swr';
import { Database } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { CreditPurchaseModal } from '@/components/pricing/PricingDialog';
import { format } from 'date-fns';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface CreditBalanceProps {
  translations: {
    credits: string;
    expiresAt: string;
    buyMore: string;
    noExpiry: string;
  };
}

export function CreditBalance({ translations }: CreditBalanceProps) {
  const { data, error, isLoading } = useSWR('/api/user/credits', fetcher, {
    revalidateOnFocus: true,
  });

  const [showPurchaseModal, setShowPurchaseModal] = React.useState(false);
  const [isHovered, setIsHovered] = React.useState(false);
  const [popoverOpen, setPopoverOpen] = React.useState(false);

  if (isLoading || error || !data?.loggedIn) {
    return null;
  }

  const balance = data.balance || 0;
  const expiresAt = data.expiresAt;

  return (
    <>
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <button
            className="group relative flex items-center gap-2 px-3 py-1.5 rounded-xl bg-linear-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 border border-purple-200/50 dark:border-purple-700/50 hover:border-purple-300 dark:hover:border-purple-600 transition-all duration-300 hover:shadow-lg hover:shadow-purple-500/10"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            aria-label="Credit balance"
          >
            <div className="relative">
              <Database
                className="w-5 h-5 text-purple-500 dark:text-purple-500"
              />
              {isHovered && <div className="absolute -inset-1 bg-purple-400/20 rounded-full animate-pulse" />}
            </div>

            <span
              className={`font-semibold text-sm transition-all duration-300 ${
                isHovered ? "text-purple-700 dark:text-purple-300" : "text-purple-600 dark:text-purple-400"
              }`}
            >
              {balance.toLocaleString()}
            </span>

            <div className="absolute inset-0 rounded-xl bg-linear-to-r from-purple-500/0 via-purple-500/5 to-pink-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          </button>
        </PopoverTrigger>

        <PopoverContent
          className="w-72 p-0 border-0 shadow-2xl shadow-purple-500/20"
          side="bottom"
          align="end"
          sideOffset={8}
        >
          <div className="relative overflow-hidden rounded-xl bg-linear-to-br from-white via-purple-50/80 to-pink-50/90 dark:from-gray-900 dark:via-purple-950/80 dark:to-pink-950/90 border border-purple-200/50 dark:border-purple-800/50">
            {/* Background decoration */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-linear-to-bl from-purple-500/10 to-transparent rounded-full -translate-y-16 translate-x-16" />
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-linear-to-tr from-pink-500/10 to-transparent rounded-full translate-y-12 -translate-x-12" />

            <div className="relative p-6 space-y-6">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-linear-to-br from-purple-500 to-pink-600 shadow-lg">
                    <Database className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">{translations.credits}</h3>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-2xl font-bold bg-linear-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                    {balance.toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Expiration */}
              {(balance > 0 || expiresAt) && (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50/50 dark:bg-gray-800/50 border border-gray-200/50 dark:border-gray-700/50">
                  <div className="flex-1">
                    {expiresAt ? (
                      <>
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{translations.expiresAt}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{format(new Date(expiresAt), 'MMM dd, yyyy HH:mm')}</p>
                      </>
                    ) : balance > 0 ? (
                      <p className="text-sm font-medium text-green-600 dark:text-green-400">{translations.noExpiry}</p>
                    ) : null}
                  </div>
                </div>
              )}

              {/* Purchase Button */}
              <Button
                onClick={() => {
                  setShowPurchaseModal(true);
                  setPopoverOpen(false);
                }}
                className="w-full bg-linear-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-medium py-2.5 rounded-lg shadow-lg hover:shadow-xl transition-all duration-300 group"
              >
                {translations.buyMore}
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <CreditPurchaseModal 
        open={showPurchaseModal}
        onOpenChange={setShowPurchaseModal}
        currentBalance={balance}
      />
    </>
  );
}