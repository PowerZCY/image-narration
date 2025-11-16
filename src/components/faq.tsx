import { getTranslations } from 'next-intl/server';
import { cn } from '@windrun-huaiin/lib/utils';
import { richText } from '@/lib/rich-text';
import { FAQInteractive } from '@/components/faq-interactive';
import type { FAQData } from '@/components/faq-types';

export async function FAQ({ 
  locale, 
  sectionClassName 
}: { 
  locale: string;
  sectionClassName?: string;
}) {
  const t = await getTranslations({ locale, namespace: 'faq' });
  
  // Process translation data
  const rawItems = t.raw('items') as Array<{
    question: string;
    answer: string;
  }>;
  
  const data: FAQData = {
    title: t('title'),
    description: richText(t, 'description'),
    items: rawItems.map((item, index) => ({
      id: `faq-item-${index}`,
      question: item.question,
      answer: richText(t, `items.${index}.answer`)
    }))
  };

  return (
    <section id="faq" className={cn("px-4 py-8 md:px-16 md:py-10 mx-4 md:mx-16 lg:mx-32 scroll-mt-20", sectionClassName)}>
      <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-center mb-3 md:mb-4">
        {data.title}
      </h2>
      <div className="text-center text-gray-600 dark:text-gray-400 mb-8 md:mb-12 text-base md:text-base lg:text-lg mx-auto max-w-2xl px-2">
        {data.description}
      </div>
      <div className="space-y-4 md:space-y-6">
        {data.items.map((item) => (
          <div
            key={item.id}
            data-faq-id={item.id}
            className="bg-white dark:bg-gray-800/60 p-4 md:p-6 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-500/50 transition shadow-sm dark:shadow-none"
          >
            <button
              className="w-full flex items-center justify-between text-left focus:outline-none gap-2"
              data-faq-toggle={item.id}
              aria-expanded="false"
            >
              <span className="text-base md:text-lg font-semibold text-gray-900 dark:text-gray-100 flex-1">{item.question}</span>
              <svg
                className="w-5 h-5 md:w-6 md:h-6 text-gray-400 flex-shrink-0 transition-transform duration-200"
                data-faq-icon={item.id}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <div
              className="mt-3 md:mt-4 text-gray-700 dark:text-gray-300 text-base md:text-base hidden"
              data-faq-content={item.id}
            >
              {item.answer}
            </div>
          </div>
        ))}
      </div>

      <FAQInteractive data={data} />
    </section>
  );
} 