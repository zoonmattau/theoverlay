import { NextResponse, type NextRequest } from "next/server";

import { AFF_COOKIE, AFF_DAYS, affiliateByCode, logClick } from "@/lib/affiliates";

/**
 * An affiliate link: theoverlay.com.au/go/CODE, optionally ?to=/pricing.
 * Logs the click, remembers the code in a cookie for 90 days, and lands the
 * visitor on today's board so they see the product first. The cookie fills
 * the code in whenever they get to sign up, from any button on the site.
 */
const BOT = /bot|crawl|spider|preview|facebookexternalhit|slackbot|twitterbot|whatsapp|telegram|discord|linkedin|skype|embedly|quora|pinterest|headlesschrome/i;

export async function GET(request: NextRequest, ctx: RouteContext<"/go/[code]">) {
  const { code } = await ctx.params;
  const aff = await affiliateByCode(code);
  const to = request.nextUrl.searchParams.get("to") ?? "/";
  const path = to.startsWith("/") && !to.startsWith("//") ? to : "/";
  const target = new URL(path, request.nextUrl.origin);
  const res = NextResponse.redirect(target, 302);
  if (aff) {
    // Link previews and crawlers set no cookie and count for nothing.
    const ua = request.headers.get("user-agent") ?? "";
    if (!BOT.test(ua)) await logClick(aff.id, path, request.headers.get("referer"), ua);
    res.cookies.set(AFF_COOKIE, aff.code, { maxAge: AFF_DAYS * 86400, path: "/", sameSite: "lax", httpOnly: true, secure: process.env.NODE_ENV === "production" });
  }
  return res;
}
