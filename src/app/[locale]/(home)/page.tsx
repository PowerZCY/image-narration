import { Hero } from "@/components/hero";
import { Usage } from "@/components/Usage";
import { Features } from "@/components/Features";
import { Tips } from "@/components/Tips";
import { SeoContent } from "@/components/seo-content";
import { FAQ} from "@/components/faq"

import { TestInfoPanel } from "@/components/debug/TestInfoPanel";

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return (
    <>
      <Hero locale={locale}/>
      <Usage locale={locale}/>
      <Features locale={locale}/>
      <Tips locale={locale}/>
      <SeoContent locale={locale}/>
      <FAQ locale={locale}/>
      <TestInfoPanel />
    </>
  )
}

