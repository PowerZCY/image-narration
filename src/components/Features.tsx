import { getTranslations } from 'next-intl/server';
import { getGlobalIcon } from '@windrun-huaiin/base-ui/components/server';
import { globalLucideIcons as icons } from '@windrun-huaiin/base-ui/components/server';
import { cn } from '@windrun-huaiin/lib/utils';
import { richText } from '@/lib/rich-text';
import type { ReactNode } from 'react';

interface FeaturesData {
  title: string;
  eyesOn: string;
  description: ReactNode;
  items: Array<{
    id: string;
    title: string;
    description: ReactNode;
    iconKey: keyof typeof icons;
  }>;
}

export async function Features({ 
  locale, 
  sectionClassName 
}: { 
  locale: string;
  sectionClassName?: string;
}) {
  const t = await getTranslations({ locale, namespace: 'features' });
  
  // Process translation data
  const featureItems = t.raw('items') as Array<{
    title: string;
    description: string;
    iconKey: keyof typeof icons;
  }>;
  
  const data: FeaturesData = {
    title: t('title'),
    eyesOn: t('eyesOn'),
    description: richText(t, 'description'),
    items: featureItems.map((feature, index) => ({
      id: `feature-item-${index}`,
      title: feature.title,
      description: richText(t, `items.${index}.description`),
      iconKey: feature.iconKey
    }))
  };

  return (
    <section id="features" className={cn("px-4 py-8 mx-4 sm:px-8 sm:mx-8 md:px-16 md:mx-16 lg:mx-32 scroll-mt-18", sectionClassName)}>
      <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-center mb-3 sm:mb-4 flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2">
        <span>{data.title}</span>
        <span className="text-purple-500">{data.eyesOn}</span>
      </h2>
      <div className="text-center text-gray-600 dark:text-gray-400 mb-8 sm:mb-10 md:mb-12 text-base sm:text-base md:text-lg mx-auto max-w-2xl px-2">
        {data.description}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 md:gap-8 gap-y-6 sm:gap-y-8 md:gap-y-12">
        {data.items.map((feature) => {
          const Icon = getGlobalIcon(feature.iconKey);
          return (
            <div
              key={feature.id}
              data-feature-id={feature.id}
              className="bg-white dark:bg-gray-800/60 p-5 sm:p-6 md:p-8 rounded-lg sm:rounded-xl border border-gray-200 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-500/50 transition shadow-sm dark:shadow-none"
            >
              <div className="flex items-center gap-3 mb-3 sm:mb-4">
                <Icon className="w-7 h-7 sm:w-8 sm:h-8 flex-shrink-0" />
                <h3 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-gray-100">{feature.title}</h3>
              </div>
              <div className="text-base sm:text-base text-gray-700 dark:text-gray-300">{feature.description}</div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
