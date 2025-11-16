import React from 'react';

export interface FAQData {
  title: string;
  description: React.ReactNode;
  items: Array<{
    id: string;
    question: string;
    answer: React.ReactNode;
  }>;
}
