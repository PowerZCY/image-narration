'use client';

import { PricingCards } from '@/components/pricing/PricingCards';
import { useState, useEffect } from 'react';
import Link from 'next/link';

interface FAQItem {
  id: string;
  question: string;
  answer: string | React.ReactNode;
}

interface FAQData {
  items: FAQItem[];
}

// FAQ Interactive Component
function FAQInteractive({ data }: { data: FAQData }) {
  const [openStates, setOpenStates] = useState<Record<string, boolean>>({});

  useEffect(() => {
    data.items.forEach((item: FAQItem) => {
      const toggleButton = document.querySelector(`[data-faq-toggle="${item.id}"]`) as HTMLButtonElement;
      const contentDiv = document.querySelector(`[data-faq-content="${item.id}"]`) as HTMLDivElement;
      const iconSvg = document.querySelector(`[data-faq-icon="${item.id}"]`) as SVGElement;

      if (toggleButton && contentDiv && iconSvg) {
        const handleClick = () => {
          const isOpen = openStates[item.id] || false;
          const newOpenState = !isOpen;

          setOpenStates(prev => ({
            ...prev,
            [item.id]: newOpenState
          }));

          if (newOpenState) {
            contentDiv.classList.remove('hidden');
            toggleButton.setAttribute('aria-expanded', 'true');
            iconSvg.style.transform = 'rotate(90deg)';
          } else {
            contentDiv.classList.add('hidden');
            toggleButton.setAttribute('aria-expanded', 'false');
            iconSvg.style.transform = 'rotate(0deg)';
          }
        };

        toggleButton.addEventListener('click', handleClick);
      }
    });

    return () => {
      data.items.forEach((item: FAQItem) => {
        const toggleButton = document.querySelector(`[data-faq-toggle="${item.id}"]`) as HTMLButtonElement;
        if (toggleButton) {
          const newButton = toggleButton.cloneNode(true);
          toggleButton.parentNode?.replaceChild(newButton, toggleButton);
        }
      });
    };
  }, [data, openStates]);

  return null;
}

export default function PricingPage() {
  const faqData: FAQData = {
    items: [
      {
        id: 'faq-item-0',
        question: 'How do credits work?',
        answer: 'Each AI narration consumes 1 credit. Credits are valid for 1 year from purchase.'
      },
      
      {
        id: 'faq-item-1',
        question: 'Do credits expire?', 
        answer: 'Yes, credits expire 1 year after purchase. '
      },
      {
        id: 'faq-item-2',
        question: 'Can I extend my credits\' expiration date?',
        answer: 'Yes! Purchasing new credits before your current ones expire automatically extends all remaining credits to match the new expiration date. This effectively extends your credit validity without losing any unused credits.'
      },
      {
        id: 'faq-item-3',
        question: 'Can I purchase more credits?',
        answer: 'Yes! You can purchase additional credits anytime. New credits extend your expiration date.'
      },
      {
        id: 'faq-item-4', 
        question: 'Can I get a refund?',
        answer: (
          <>
            We offer a 3-day money-back guarantee for first-time purchases if less than 20% of credits are used.{' '}
            <Link href="/legal/refund" className="text-purple-600 hover:text-purple-800 underline">
              View full refund policy
            </Link>
            .
          </>
        )
      }
    ]
  };
  return (
    <div className="container mt-10 mx-auto px-4 py-8 sm:py-16 min-h-[90vh]">
      <div className="text-center mb-10 sm:mb-12">
        <h1 className="text-2xl sm:text-4xl font-bold mb-2 sm:mb-4 leading-tight">
          Simple, Transparent Pricing
        </h1>
        <div className="mt-2 sm:mt-6 flex flex-wrap justify-center gap-1 sm:gap-6 text-base sm:text-lg text-gray-600 dark:text-gray-400">
          <div className="flex items-center gap-2">
            <span className="text-green-600 font-medium">&nbsp;✓</span>
            <span>No subscription required</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-green-600 font-medium">&nbsp;✓</span>
            <span>One-time payment</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-green-600 font-medium">&nbsp;✓</span>
            <span>Credits valid for 1 year</span>
          </div>
        </div>
      </div>

      <PricingCards />

      <div className="mt-4 sm:mt-8 text-center">
        <p className="text-base text-muted-foreground">
          1 credit = 1 image narration
        </p>
      </div>

      <div className="mt-16 max-w-4xl mx-auto">
        <h2 className="text-2xl font-semibold mb-6 text-center">
          Frequently Asked Questions
        </h2>
        
        <div className="space-y-6">
          {faqData.items.map((item) => (
            <div
              key={item.id}
              data-faq-id={item.id}
              className="bg-white dark:bg-gray-800/60 p-6 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-500/50 transition shadow-sm dark:shadow-none"
            >
              <button
                className="w-full flex items-center justify-between text-left focus:outline-none"
                data-faq-toggle={item.id}
                aria-expanded="false"
              >
                <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">{item.question}</span>
                <svg 
                  className="w-6 h-6 text-gray-400 ml-2 transition-transform duration-200" 
                  data-faq-icon={item.id}
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
              <div 
                className="mt-4 text-gray-700 dark:text-gray-300 text-base hidden" 
                data-faq-content={item.id}
              >
                {item.answer}
              </div>
            </div>
          ))}
        </div>
        
        <FAQInteractive data={faqData} />
      </div>
    </div>
  );
}
