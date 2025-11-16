/* eslint-disable react/no-unescaped-entities */
import { getTranslations } from 'next-intl/server';
import { cn } from '@windrun-huaiin/lib/utils';
import { richText } from '@/lib/rich-text';

interface SeoSection {
  id: string;
  title: string;
  content: React.ReactNode;
}

interface SeoContentData {
  title: string;
  eyesOn: string;
  description: string;
  intro: React.ReactNode;
  sections: SeoSection[];
  conclusion: React.ReactNode;
}

export async function SeoContent({ 
  locale, 
  sectionClassName 
}: { 
  locale: string;
  sectionClassName?: string;
}) {
  const t = await getTranslations({ locale, namespace: 'seoContent' });
  
  // Process translation data
  const rawSections = t.raw('sections') as Array<{
    title: string;
    content: string;
  }>;
  
  const data: SeoContentData = {
    title: t('title'),
    eyesOn: t('eyesOn'),
    description: t('description'),
    intro: richText(t, 'intro'),
    sections: rawSections.map((section, index) => ({
      id: `seo-section-${index}`,
      title: section.title,
      content: richText(t, `sections.${index}.content`)
    })),
    conclusion: richText(t, 'conclusion')
  };

  return (
    <section id="seo" className={cn("px-4 py-8 mx-4 md:px-16 md:py-10 md:mx-16 lg:mx-32 scroll-mt-20", sectionClassName)}>
      <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-center mb-6 md:mb-8 flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2">
        <span>{data.title}</span>
        <span className="text-purple-500">{data.eyesOn}</span>
      </h2>
      <h3 className="text-center text-gray-600 dark:text-gray-400 mb-8 md:mb-12 text-base md:text-lg px-2">
        {data.description}
      </h3>
      <div className="bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-xl md:rounded-2xl p-6 md:p-8 lg:p-12 shadow-sm dark:shadow-none">
        <div className="space-y-6 md:space-y-10">
          <div className="text-gray-600 dark:text-gray-400 text-base md:text-lg leading-relaxed">
            {data.intro}
          </div>
          {data.sections.map((section) => (
            <div key={section.id} data-seo-section={section.id}>
              <h2 className="text-lg md:text-xl font-semibold mb-2 md:mb-3 text-gray-900 dark:text-gray-100 flex items-center">
                {section.title}
              </h2>
              <div className="text-gray-700 dark:text-gray-300 text-base md:text-base leading-relaxed">{section.content}</div>
            </div>
          ))}
        </div>
        <div className="mt-8 md:mt-10 text-gray-600 dark:text-gray-400 text-base md:text-lg leading-relaxed">
          {data.conclusion}
        </div>
      </div>
    </section>
  )
}

