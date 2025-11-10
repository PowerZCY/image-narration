import { Hero } from "@/components/hero";
import { FAQ, Features, SeoContent, Tips, } from "@windrun-huaiin/third-ui/main/server";
import { Usage } from "@/components/Usage";
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

