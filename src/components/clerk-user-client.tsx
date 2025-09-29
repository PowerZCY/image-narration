'use client';

import { Coins } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ClerkLoaded, ClerkLoading, SignedIn, SignedOut, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";

interface ClerkUserData {
  signIn: string;
  signUp: string;
  terms: string;
  privacy: string;
  orders: string;
  locale: string;
  clerkAuthInModal: boolean;
  showSignUp: boolean;
  hasPaidOrders: boolean;
}

export function ClerkUserClient({ data }: { data: ClerkUserData }) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const loadingPlaceholder = (
    <div className="ms-1.5 flex items-center gap-2 h-10 me-3">
      <div className="w-20 h-9 px-2 border border-gray-300 rounded-full hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800 text-center text-sm" />
    </div>
  );

  if (!isMounted) {
    return loadingPlaceholder;
  }

  return (
    <div className="ms-1.5 flex items-center gap-2 h-10 me-3">
      <ClerkLoading>{loadingPlaceholder.props.children}</ClerkLoading>
      <ClerkLoaded>
        <SignedOut>
          <SignInButton mode={data.clerkAuthInModal ? 'modal' : 'redirect'}>
            <button className="w-20 h-9 px-2 border border-gray-300 rounded-full hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800 text-center text-sm">
              {data.signIn}
            </button>
          </SignInButton>
          {data.showSignUp && (
            <SignUpButton mode={data.clerkAuthInModal ? 'modal' : 'redirect'}>
              <button className="w-20 h-9 px-2 border border-gray-300 rounded-full hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800 text-center text-sm">
                {data.signUp}
              </button>
            </SignUpButton>
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
                  labelIcon={<Coins className="size-4 fill-none stroke-[var(--clerk-icon-stroke-color)]" />}
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
