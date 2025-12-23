import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from 'next/server';
import createMiddleware from 'next-intl/middleware';
import { appConfig } from "@/lib/appConfig";

const intlMiddleware = createMiddleware({
  locales: appConfig.i18n.locales,
  defaultLocale: appConfig.i18n.defaultLocale,
  localePrefix: appConfig.i18n.localePrefixAsNeeded ? "as-needed" : "always", 
  localeDetection: false
});

// 需要身份验证的路径
const protectedRoutes = createRouteMatcher([
  '/(.*)/activity(.*)',
  '/(.*)/orders(.*)',
  '/api/user/(.*)',
  '/api/payments/checkout',
  '/api/payments/activity',
])

// 公开的API路径（不需要身份验证）
const publicApiRoutes = createRouteMatcher([
  '/api/payments/webhook',      // Stripe支付webhook
  '/api/clerk/webhook',         // Clerk用户管理webhook  
  '/api/anonymous-usage',       // 匿名用户使用统计
  '/api/user/credits',  // 用户积分
  '/api/user/last-order'  // 用户最近订单信息
])

// v6 官方推荐写法：直接 export default clerkMiddleware(handler, options)
// 完全不需要再包一层函数，也不需要手动 (req)
export default clerkMiddleware(
  async (auth, req: NextRequest) => {
    const { defaultLocale, locales } = appConfig.i18n;
    const pathname = req.nextUrl.pathname;
    const hasLocalePrefix = locales.some(
      (loc) => pathname === `/${loc}` || pathname.startsWith(`/${loc}/`)
    );

    // 对于无语言前缀的页面请求，根据配置进行处理
    // 避免落不到 [locale] 路由。
    if (!hasLocalePrefix && !pathname.startsWith('/api/')) {
      const url = req.nextUrl.clone();
      url.pathname = `/${defaultLocale}${pathname}`;

      if (appConfig.i18n.localePrefixAsNeeded) {
        // as-needed: 内部rewrite，用户URL保持无前缀
        console.log('[middleware rewrite]', { from: pathname, to: url.pathname });
        return NextResponse.rewrite(url);
      } else {
        // always: 重定向给用户，让他们看到前缀URL
        console.log('[middleware redirect]', { from: pathname, to: url.pathname });
        return NextResponse.redirect(url);
      }
    }

    // 跳过公开API路由的身份验证
    if (publicApiRoutes(req)) {
      return NextResponse.next();
    }
    
    // 检查是否是受保护的路由
    if (protectedRoutes(req)) {
        const { userId: clerkUserId, redirectToSignIn } = await auth()
        if (!clerkUserId) {
            return redirectToSignIn()
        }
        console.log('User is authorized:', clerkUserId)
    }

    // Skip i18n middleware for API routes
    if (req.nextUrl.pathname.startsWith('/api/')) {
      return NextResponse.next();
    }

    // handle trailing slash redirect
    if (req.nextUrl.pathname.length > 1 && req.nextUrl.pathname.endsWith('/')) {
      const newUrl = new URL(req.nextUrl.pathname.slice(0, -1), req.url);
      return NextResponse.redirect(newUrl, 301);
    }

    return intlMiddleware(req);
  }, { debug: appConfig.clerk.debug }
);

export const config = {
  matcher: [
    // Include API routes for authentication, skip Next.js internals and static files
    "/((?!_next|sitemap.xml?|robots.txt?|[^?]*.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Include user and payment API routes
    "/api/user/(.*)",
    "/api/payments/(.*)",
    "/api/clerk/(.*)"
  ],
};