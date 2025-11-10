import { getTranslations } from 'next-intl/server';
import { cn } from '@windrun-huaiin/lib/utils';
import { globalLucideIcons as icons, getGlobalIcon } from '@windrun-huaiin/base-ui/components/server'

interface UsageData {
  title: string;
  eyesOn: string;
  description: string;
  steps: Array<{
    id: string;
    title: string;
    description: string;
    iconKey: keyof typeof icons;
    stepNumber: number;
  }>;
}

export async function Usage({ 
  locale, 
  sectionClassName 
}: { 
  locale: string;
  sectionClassName?: string;
}) {
  const t = await getTranslations({ locale, namespace: 'usage' });
  
  // Process translation data
  const steps = t.raw('steps') as Array<{
    title: string;
    description: string;
    iconKey: keyof typeof icons;
  }>;
  
  const data: UsageData = {
    title: t('title'),
    eyesOn: t('eyesOn'),
    description: t('description'),
    steps: steps.map((step, index) => ({
      id: `usage-step-${index}`,
      title: step.title,
      description: step.description,
      iconKey: step.iconKey,
      stepNumber: index + 1
    }))
  };

  return (
    <section id="usage" className={cn("px-4 py-8 mx-4 sm:px-8 sm:mx-8 md:px-16 md:mx-16 lg:mx-32 scroll-mt-20", sectionClassName)}>
      <h2 className="text-2xl md:text-4xl font-bold text-center mb-4 flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2">
        <span className="whitespace-nowrap">{data.title}</span>
        <span className="text-purple-500">{data.eyesOn}</span>
      </h2>
      <p className="text-center text-gray-600 dark:text-gray-400 mb-12 text-base md:text-lg mx-auto max-w-2xl">
        {data.description}
      </p>
      <div className="bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 sm:p-6 md:p-8 lg:p-12 shadow-sm dark:shadow-none">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 gap-y-8 sm:gap-y-12">
          {data.steps.map((step) => {
            const Icon = getGlobalIcon(step.iconKey);
            return (
              <div key={step.id} data-usage-step={step.id} className="flex items-start">
                <div className="shrink-0 mr-3 sm:mr-4">
                  <Icon className="w-7 h-7 sm:w-8 sm:h-8 text-purple-500" />
                </div>
                <div>
                  <h3 className="text-lg sm:text-xl font-semibold mb-2 sm:mb-3 text-gray-900 dark:text-gray-100 flex items-center">
                    {`${step.stepNumber}. ${step.title}`}
                  </h3>
                  <p className="text-base sm:text-base text-gray-700 dark:text-gray-300">{step.description}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
