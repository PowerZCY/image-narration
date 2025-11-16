import { getTranslations } from 'next-intl/server';
import { cn } from '@windrun-huaiin/lib/utils';
import { richText } from '@/lib/rich-text';
import { ReactNode } from 'react';

interface TipSection {
  id: string;
  title: string;
  description: ReactNode;
}

interface TipsData {
  title: string;
  eyesOn: string;
  leftColumn: TipSection[];
  rightColumn: TipSection[];
}

export async function Tips({ 
  locale, 
  sectionClassName 
}: { 
  locale: string;
  sectionClassName?: string;
}) {
  const t = await getTranslations({ locale, namespace: 'tips' });
  
  // Process translation data
  const sections = t.raw('sections') as Array<{
    title: string;
    description: string;
  }>;
  
  const processedSections = sections.map((section, index) => ({
    id: `tip-section-${index}`,
    title: section.title,
    description: richText(t, `sections.${index}.description`)
  }));
  
  const midPoint = Math.ceil(processedSections.length / 2);
  const leftColumn = processedSections.slice(0, midPoint);
  const rightColumn = processedSections.slice(midPoint);
  
  const data: TipsData = {
    title: t('title'),
    eyesOn: t('eyesOn'),
    leftColumn,
    rightColumn
  };

  return (
    <section id="tips" className={cn("px-4 py-8 mx-4 sm:px-8 sm:mx-8 md:px-16 md:mx-16 lg:mx-32 scroll-mt-20", sectionClassName)}>
      <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-center mb-8 sm:mb-12 md:mb-16 flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2">
        <span>{data.title}</span>
        <span className="text-purple-500">{data.eyesOn}</span>
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 md:gap-12 bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-xl sm:rounded-2xl p-4 sm:p-6 md:p-8 lg:p-12 shadow-sm dark:shadow-none">
        {[data.leftColumn, data.rightColumn].map((column: TipSection[], colIndex) => (
          <div key={colIndex} className="space-y-6 sm:space-y-8">
            {column.map((tip: TipSection) => (
              <div key={tip.id} data-tip-id={tip.id} className="space-y-2 sm:space-y-3 md:space-y-4">
                <h3 className="text-xl sm:text-2xl font-semibold">{tip.title}</h3>
                <div className="text-base sm:text-base text-gray-700 dark:text-gray-300">{tip.description}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  )
}

