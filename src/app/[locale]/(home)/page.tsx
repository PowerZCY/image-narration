'use client';

import { Hero } from "@/components/hero";
import { pricePlanConfig } from "@/lib/price-config";
import { CTA, FAQ, Features, PricePlan, SeoContent, Tips, Usage } from "@windrun-huaiin/third-ui/main";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col bg-neutral-100 dark:bg-neutral-900 transition-colors duration-300">
      <Hero />
      <PricePlan pricePlanConfig={pricePlanConfig} currency="￥" />
      <Usage />
      <Features />
      <Tips />
      <FAQ />
      <SeoContent />
      <CTA />
    </main>
  )
}

