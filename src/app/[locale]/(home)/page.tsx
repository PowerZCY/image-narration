import { Hero } from "@/components/hero";
import { FAQ, Features, SeoContent, Tips, Usage } from "@windrun-huaiin/third-ui/main/server";
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

