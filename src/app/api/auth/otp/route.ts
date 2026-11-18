import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/auth/next-path";
import { localeParam, localized, routeClient } from "@/lib/auth/route-client";
import {
  LIMITS,
  OTP_COOKIE_OPTIONS,
  OTP_EMAIL_COOKIE,
  allow,
  clientIp,
  isAllowlisted,
  normalizeEmail,
  sameOrigin,
} from "@/lib/auth/otp";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/otp (form: email, locale, next): "Member log in", step 1.
 *
 * Only an email on the club list gets a code. Every valid email gets the SAME answer
 * (the "If this email is on the club list…" screen), so the form can't be used to find
 * out who is a member. There is no public sign-up: on a member's first login Supabase
 * creates their user, and the before_user_created hook refuses anyone who isn't on the list.
 */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return new NextResponse("Forbidden", { status: 403 });
  const form = await request.formData().catch(() => null);
  const field = (k: string) => {
    const v = form?.get(k);
    return typeof v === "string" ? v : null;
  };
  const locale = localeParam(field("locale"));
  const next = safeNext(field("next"), "/me");
  const login = (params: Record<string, string>) => {
    const url = new URL(localized(locale, "/login"), request.nextUrl.origin);
    for (const [k, v] of Object.entries({ ...params, next })) url.searchParams.set(k, v);
    return url;
  };

  const client = routeClient(request);
  if (!client) return NextResponse.redirect(login({ error: "unavailable" }), 303);

  const email = normalizeEmail(field("email"));
  if (!email) return client.apply(NextResponse.redirect(login({ error: "email" }), 303));

  if (!allow(`req:ip:${clientIp(request)}`, LIMITS.requestPerIp) || !allow(`req:email:${email}`, LIMITS.requestPerEmail)) {
    return client.apply(NextResponse.redirect(login({ error: "throttled" }), 303));
  }

  try {
    const listed = await isAllowlisted(email);
    // null = no secret key configured: the auth hook is then the only gate.
    if (listed !== false) {
      const { error } = await client.supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
      // Never shown to the visitor (that would reveal who is on the list). No email in the log.
      if (error) console.error("signInWithOtp failed:", error.status ?? "", error.code ?? error.message);
    }
  } catch (e) {
    console.error("code request failed:", e instanceof Error ? e.message : "unknown");
  }

  const res = NextResponse.redirect(login({ sent: "1" }), 303);
  res.cookies.set(OTP_EMAIL_COOKIE, email, OTP_COOKIE_OPTIONS);
  return client.apply(res);
}
