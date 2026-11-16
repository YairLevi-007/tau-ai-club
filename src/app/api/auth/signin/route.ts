import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/auth/next-path";
import { localeParam, localized, routeClient } from "@/lib/auth/route-client";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/signin?next=/admin/members&locale=en
 * Starts Google sign-in (PKCE). The code verifier goes into an HttpOnly cookie.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const locale = localeParam(searchParams.get("locale"));
  const next = safeNext(searchParams.get("next"));
  const loginUrl = (error: string) => new URL(`${localized(locale, "/login")}?error=${error}`, origin);

  const client = routeClient(request);
  if (!client) return NextResponse.redirect(loginUrl("unavailable"), 303);

  const callback = new URL("/api/auth/callback", origin);
  callback.searchParams.set("locale", locale);
  callback.searchParams.set("next", next);

  const { data, error } = await client.supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: callback.toString(),
      skipBrowserRedirect: true,
      // Let people with several Google accounts pick the club one.
      queryParams: { prompt: "select_account" },
    },
  });
  if (error || !data?.url) return client.apply(NextResponse.redirect(loginUrl("failed"), 303));
  return client.apply(NextResponse.redirect(data.url, 303));
}
