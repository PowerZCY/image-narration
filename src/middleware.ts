import { clerkMiddleware, ClerkMiddlewareAuth, createRouteMatcher } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from 'next/server';
import createMiddleware from 'next-intl/middleware';
import { appConfig } from "@/lib/appConfig";

const intlMiddleware = createMiddleware({
  locales: appConfig.i18n.locales,

  defaultLocale: appConfig.i18n.defaultLocale,
  localePrefix: "always",
  localeDetection: false
});

// 需要身份验证的路径
const protectedRoutes = createRouteMatcher([
  '/(.*)/history(.*)',
  '/(.*)/orders(.*)',
  '/api/user/(.*)',
  '/api/payments/checkout',
  '/api/payments/history',
  '/api/ai-generate',
])

// 公开的API路径（不需要身份验证）
const publicApiRoutes = createRouteMatcher([
  '/api/payments/webhook',      // Stripe支付webhook
  '/api/clerk/webhook',         // Clerk用户管理webhook  
  '/api/anonymous-usage',       // 匿名用户使用统计
])

export default clerkMiddleware(async (auth: ClerkMiddlewareAuth, req: NextRequest) => {
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

  // handle root path to default locale permanent redirect
  if (req.nextUrl.pathname === '/') {
    const defaultLocale = appConfig.i18n.defaultLocale;
    return NextResponse.redirect(new URL(`/${defaultLocale}`, req.url), 301);
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