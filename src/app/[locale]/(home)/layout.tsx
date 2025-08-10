import { baseOptions, homeNavLinks, levelNavLinks } from '@/app/[locale]/layout.config';
import { Footer } from '@windrun-huaiin/third-ui/main/server';
import { GoToTop } from '@windrun-huaiin/third-ui/main';
import { HomeLayout, type HomeLayoutProps } from 'fumadocs-ui/layouts/home';
import { FumaBannerSuit } from '@windrun-huaiin/third-ui/fuma/server';
import type { ReactNode } from 'react';
import { showBanner } from '@/lib/appConfig';
import { ClerkProviderClient } from '@windrun-huaiin/third-ui/clerk';

async function homeOptions(locale: string): Promise<HomeLayoutProps> {
  return {
    ...(await baseOptions(locale)),
    links: [
      ...(await levelNavLinks(locale)),
      ...(await homeNavLinks(locale)),
    ]
  };
}

export default async function Layout({
  params,
  children,
}: {
  params: Promise<{ locale: string }>;
  children: ReactNode;
}) {
  const { locale } = await params;
  const customeOptions = await homeOptions(locale);
  
  return (
    <ClerkProviderClient locale={locale}>
      <HomeLayout
        {...customeOptions}
        searchToggle={{
          enabled: false,
        }}
        themeSwitch={{
          enabled: true,
          mode: 'light-dark-system',
        }}
        className={`min-h-screen flex flex-col bg-neutral-100 dark:bg-neutral-900 transition-colors duration-300 ${showBanner ? 'pt-30 has-banner' : 'pt-15 no-banner'}`}
        >
        <FumaBannerSuit locale={locale} showBanner={showBanner}/>
        {children}
        <Footer locale={locale}/>
        <GoToTop />
      </HomeLayout>
    </ClerkProviderClient>
  );
}

