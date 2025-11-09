'use client';

import { useAuth } from '@clerk/nextjs';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

export function DynamicNavLinks() {
  const { isSignedIn, isLoaded } = useAuth();
  const t = useTranslations('linkPreview');
  const { locale } = useParams() as { locale: string };
  const pathname = usePathname();
  const isActive = pathname?.startsWith(`/${locale}/activity`);

  // 使用 useState 确保只在客户端渲染,避免 hydration 不匹配
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // 服务端渲染和首次客户端渲染时返回 null
  if (!isMounted || !isLoaded) {
    return null;
  }

  if (!isSignedIn) {
    return null;
  }

  return (
    <Link
      href={`/${locale}/activity`}
      data-active={isActive}
      className={cn(
        'inline-flex items-center p-2 text-foreground transition-colors hover:text-fd-accent-foreground data-[active=true]:text-fd-primary'
      )}
    >
      {t('activity')}
    </Link>
  );
}
