import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/auth/next-path";
import { localeParam, localized, routeClient } from "@/lib/auth/route-client";

export const dynamic = "force-dynamic";

type Membership = { full_name: string; role: string; first_login: boolean };

/**
 * GET /api/auth/callback?code=…&locale=…&next=…
 * Google → Supabase → here. Exchanges the code for a session, then asks the database
 * whether this verified email is on the allowlist (claim_membership):
 *   not on the list → /members-only
 *   first login     → /welcome (then on to `next`)
 *   otherwise       → `next`
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const locale = localeParam(searchParams.get("locale"));
  const next = safeNext(searchParams.get("next"));
  const to = (path: string) => new URL(path, origin);
  const loginError = (error: string) => to(`${localized(locale, "/login")}?error=${error}`);

  const client = routeClient(request);
  if (!client) return NextResponse.redirect(loginError("unavailable"), 303);
  const go = (url: URL) => client.apply(NextResponse.redirect(url, 303));

  // e.g. the user closed the Google consent screen.
  if (searchParams.get("error")) return go(loginError("cancelled"));
  const code = searchParams.get("code");
  if (!code) return go(loginError("failed"));

  const { error } = await client.supabase.auth.exchangeCodeForSession(code);
  if (error) return go(loginError("failed"));

  const { data: rows, error: claimError } = await client.supabase.rpc("claim_membership");
  if (claimError) return go(loginError("failed"));
  const membership = (Array.isArray(rows) ? rows[0] : null) as Membership | null;

  if (!membership) return go(to(localized(locale, "/members-only")));
  if (membership.first_login) {
    const welcome = to(localized(locale, "/welcome"));
    welcome.searchParams.set("next", next);
    return go(welcome);
  }
  // `next` is locale-free ("/admin/members"); put the locale back in front.
  return go(to(localized(locale, next)));
}
