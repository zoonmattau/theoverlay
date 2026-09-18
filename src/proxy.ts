import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { ARRIVAL_COOKIE, ARRIVAL_DAYS, arrivalFrom } from "@/lib/arrival";

/**
 * Keeps the Supabase session fresh on every request and protects the account
 * page. Nothing else lives here: authorisation is re-checked next to the data.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  // A first visit is remembered: where they landed and where from, so a
  // sign-up weeks later can say how they found us.
  const firstVisit = request.method === "GET" && !request.cookies.has(ARRIVAL_COOKIE) && request.headers.get("accept")?.includes("text/html") && !request.nextUrl.pathname.startsWith("/api/");
  const remember = (res: NextResponse) => {
    if (firstVisit) {
      res.cookies.set(ARRIVAL_COOKIE, JSON.stringify(arrivalFrom(request.nextUrl, request.headers.get("referer"))), { maxAge: ARRIVAL_DAYS * 86400, path: "/", sameSite: "lax", httpOnly: true, secure: process.env.NODE_ENV === "production" });
    }
    return res;
  };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return remember(response);

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // OVERLAY_OPEN=1 is local development with no login; the account page renders in open mode.
  const guarded = ["/account", "/reset"];
  if (!user && process.env.OVERLAY_OPEN !== "1" && guarded.some((g) => request.nextUrl.pathname.startsWith(g))) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.searchParams.set("next", request.nextUrl.pathname);
    return remember(NextResponse.redirect(login));
  }

  return remember(response);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png|brand/|api/stripe/webhook).*)"],
};
