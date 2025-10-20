'use client';

import { useAuth } from '@clerk/nextjs';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';

export function DynamicNavLinks() {
  const { isSignedIn } = useAuth();
  const t = useTranslations('linkPreview');
  const { locale } = useParams() as { locale: string };
  const pathname = usePathname();
  const isActive = pathname?.startsWith(`/${locale}/activity`);

  if (!isSignedIn) {
    return null;
  }

  return (
    <Link
      href={`/${locale}/activity`}
      data-active={isActive}
      className={cn(
        'inline-flex items-center gap-1 p-2 text-fd-muted-foreground transition-colors hover:text-fd-accent-foreground data-[active=true]:text-fd-primary [&_svg]:size-4'
      )}
    >
      {t('activity')}
    </Link>
  );
}
