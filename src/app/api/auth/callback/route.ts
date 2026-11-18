import { NextResponse, type NextRequest } from "next/server";
import { afterSignIn } from "@/lib/auth/finish";
import { safeNext } from "@/lib/auth/next-path";
import { localeParam, localized, routeClient } from "@/lib/auth/route-client";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/callback?code=…&locale=…&next=…
 * Google → Supabase → here (dormant: the login page now uses email codes, but the
 * Google path still works if the provider is switched on). Exchanges the code for a
 * session, then afterSignIn() decides where to go.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const locale = localeParam(searchParams.get("locale"));
  const next = safeNext(searchParams.get("next"), "/me");
  const loginError = (error: string) => new URL(`${localized(locale, "/login")}?error=${error}`, origin);

  const client = routeClient(request);
  if (!client) return NextResponse.redirect(loginError("unavailable"), 303);
  const go = (res: NextResponse) => client.apply(res);

  // e.g. the user closed the Google consent screen.
  if (searchParams.get("error")) return go(NextResponse.redirect(loginError("cancelled"), 303));
  const code = searchParams.get("code");
  if (!code) return go(NextResponse.redirect(loginError("failed"), 303));

  const { error } = await client.supabase.auth.exchangeCodeForSession(code);
  if (error) return go(NextResponse.redirect(loginError("failed"), 303));

  const res = await afterSignIn(client.supabase, origin, locale, next);
  return go(res ?? NextResponse.redirect(loginError("failed"), 303));
}
