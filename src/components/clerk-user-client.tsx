'use client';

import { Coins } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ClerkLoaded, SignedIn, SignedOut, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";

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

export function ClerkUserClient({ data }: { data: ClerkUserData }) {
  // 只在客户端渲染，避免 hydration 不匹配
  const [isMounted, setIsMounted] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const badgeRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    setTimeout(() => {
      setIsMounted(true)
    }, 0)
  }, []);

  useEffect(() => {
    if (!showTooltip || !badgeRef.current) return;

    const updatePosition = () => {
      if (badgeRef.current) {
        const rect = badgeRef.current.getBoundingClientRect();
        setTooltipPosition({
          x: rect.left + rect.width / 2 - 30, // 向左偏移 30px
          y: rect.top - 8,
        });
      }
    };

    updatePosition();
    window.addEventListener('scroll', updatePosition);
    window.addEventListener('resize', updatePosition);

    return () => {
      window.removeEventListener('scroll', updatePosition);
      window.removeEventListener('resize', updatePosition);
    };
  }, [showTooltip]);

  // 服务端和首次客户端渲染时返回 null，避免 hydration 不匹配
  if (!isMounted) {
    return null;
  }

  return (
    <div className="ms-1.5 flex! items-center gap-2 h-10 me-3" data-clerk-user-area>
      <ClerkLoaded>
        <SignedOut>
          <SignInButton mode={data.clerkAuthInModal ? 'modal' : 'redirect'}>
            <button className="w-16 sm:w-20 h-8 sm:h-9 px-1.5 sm:px-2 border border-gray-300 rounded-full hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800 text-center text-xs sm:text-sm whitespace-nowrap">
              {data.signIn}
            </button>
          </SignInButton>
          {data.showSignUp && (
            <div className="relative z-1002">
              <SignUpButton mode={data.clerkAuthInModal ? 'modal' : 'redirect'}>
                <button className="w-16 sm:w-20 h-8 sm:h-9 px-1.5 sm:px-2 border border-gray-300 rounded-full hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800 text-center text-xs sm:text-sm whitespace-nowrap">
                  {data.signUp}
                </button>
              </SignUpButton>
              {/* Sign Up Bonus Badge */}
              <span
                ref={badgeRef}
                onMouseEnter={() => setShowTooltip(true)}
                onMouseLeave={() => setShowTooltip(false)}
                className="absolute -top-0.5 sm:-top-1 -right-1.5 sm:-right-2 flex h-4 sm:h-5 min-w-4 sm:min-w-5 items-center justify-center rounded-full bg-linear-to-r from-purple-600 to-pink-600 px-1 sm:px-1.5 text-[9px] sm:text-[10px] font-bold text-white shadow-lg ring-1 sm:ring-2 ring-white dark:ring-gray-900 cursor-default"
              >
                {data.signUpBonus}
              </span>
              {/* Tooltip - 使用 Portal 渲染到 body */}
              {isMounted && showTooltip && createPortal(
                <div
                  className="fixed whitespace-nowrap rounded-lg bg-linear-to-r from-purple-50 to-pink-50 dark:from-purple-900/90 dark:to-pink-900/90 border border-purple-200/50 dark:border-purple-700/50 px-3 py-1.5 text-xs font-medium text-purple-900 dark:text-purple-50 shadow-lg shadow-purple-500/20 transition-opacity pointer-events-none z-9999"
                  style={{
                    left: `${tooltipPosition.x}px`,
                    top: `${tooltipPosition.y}px`,
                    transform: 'translate(-50%, -100%)',
                  }}
                >
                  {data.signUpBonusTooltip}
                </div>,
                document.body
              )}
            </div>
          )}
        </SignedOut>
        <SignedIn>
          <UserButton
            appearance={{
              elements: {
                userButtonAvatarBox: "w-8 h-8 border",
                userButtonPopoverCard: "w-40 min-w-0",
              }
            }}
          >
            <UserButton.MenuItems>
              <UserButton.Action label="manageAccount" />
              {data.hasPaidOrders && (
                <UserButton.Link
                  labelIcon={<Coins className="size-4 fill-none stroke-(--clerk-icon-stroke-color)" />}
                  label={data.orders}
                  href={`/${data.locale}/orders`}>
                </UserButton.Link>
              )}
              <UserButton.Action label="signOut" />
            </UserButton.MenuItems>
          </UserButton>
        </SignedIn>
      </ClerkLoaded>
    </div>
  );
}
