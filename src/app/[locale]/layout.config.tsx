import { i18n } from '@/i18n';
import { appConfig } from '@/lib/appConfig';
import { SiteIcon } from '@/lib/site-config';
import { DClerkUser } from '@/components/clerk-user';
import { DynamicNavLinks } from '@/components/dynamic-nav-links';
import { type LinkItemType } from 'fumadocs-ui/layouts/docs';
import { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { getTranslations } from 'next-intl/server';

type ExtendedLinkItem = LinkItemType & { mobilePinned?: boolean };
// home page normal menu
export async function homeNavLinks(locale: string): Promise<ExtendedLinkItem[]> {
  const t1 = await getTranslations({ locale: locale, namespace: 'linkPreview' });
  return [
    {
      text: t1('blog'),
      url: `/${locale}/blog`,
      // 桌面端在导航栏显示，移动端通过 CSS 隐藏，只在菜单显示
    },
    {
      text: t1('pricing'),
      url: `/${locale}/pricing`,
      // 桌面端在导航栏显示，移动端通过 CSS 隐藏，只在菜单显示
    },
    {
      type: 'custom',
      // Activity 链接（仅登录用户）- 桌面端在导航栏显示，移动端只在菜单显示
      mobilePinned: false,
      children: <DynamicNavLinks />
    },
    {
      type: 'custom',
      // false就先排左边的菜单, true就先排右边的按钮
      secondary: true,
      // true代表在移动端也会出现在主菜单栏上，不会被折叠
      mobilePinned: true,
      children: <DClerkUser locale={locale} clerkAuthInModal={appConfig.style.clerkAuthInModal} />
    },
  ];
}

// level special menu
export async function levelNavLinks(locale: string): Promise<ExtendedLinkItem[]> {
  console.log('levelNavLinks TODO: add links here', locale);
  return [];
}

export async function baseOptions(locale: string): Promise<BaseLayoutProps> {
  const t = await getTranslations({ locale: locale, namespace: 'home' });
  return {
    nav: {
      url: `/${locale}`,
      title: (
        <>
          <SiteIcon />
          <span className="font-medium in-[.uwu]:hidden in-[header]:text-[15px]">
            {t('title')}
          </span>
        </>
      ),
      transparentMode: 'none',
    },
    i18n,
  };
}
