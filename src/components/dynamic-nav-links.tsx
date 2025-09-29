'use client';

import { useAuth } from '@clerk/nextjs';
import { ReceiptText } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useParams } from 'next/navigation';

export function DynamicNavLinks() {
  const { isSignedIn } = useAuth();
  const t = useTranslations('linkPreview');
  const { locale } = useParams() as { locale: string };

  if (!isSignedIn) {
    return null;
  }

  return (
    <Link
      href={`/${locale}/history`}
      className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 transition-colors"
    >
      <ReceiptText className="w-4 h-4" />
      {t('history')}
    </Link>
  );
}