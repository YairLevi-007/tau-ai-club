import { NextResponse, after, type NextRequest } from "next/server";
import { safeNext } from "@/lib/auth/next-path";
import { localeParam, localized, routeClient } from "@/lib/auth/route-client";
import {
  CodeRequestError,
  LIMITS,
  OTP_COOKIE_OPTIONS,
  OTP_EMAIL_COOKIE,
  allow,
  clientIp,
  codeFailKind,
  isAllowlisted,
  logCodeFailure,
  normalizeEmail,
  requestCodeAsServer,
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
 *
 * The list check and the code request run after the response (after()), so a listed and an
 * unlisted email also take the same time to answer. The code is requested with the secret
 * key: Supabase's public code endpoint is closed by CAPTCHA (see requestCodeAsServer).
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

  after(async () => {
    try {
      const listed = await isAllowlisted(email);
      if (listed === false) return;
      let sent = await requestCodeAsServer(email);
      if (!sent) {
        // No secret key: the publishable key and the auth hook alone. Fine in local dev and
        // tests; in production, with CAPTCHA on, this fails, so it is always logged there.
        if (process.env.NODE_ENV === "production") logCodeFailure("NO_SECRET_KEY");
        sent = await client.supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
      }
      // Never shown to the visitor (that would reveal who is on the list). No email in the log.
      if (sent.error) {
        const { status, code } = sent.error;
        logCodeFailure(codeFailKind(sent.error), `${status ?? ""} ${code ?? ""}`.trim());
      }
    } catch (e) {
      if (e instanceof CodeRequestError) logCodeFailure(e.kind, e.detail);
      else logCodeFailure("ERROR", e instanceof Error ? e.name : "unknown");
    }
  });

  const res = NextResponse.redirect(login({ sent: "1" }), 303);
  res.cookies.set(OTP_EMAIL_COOKIE, email, OTP_COOKIE_OPTIONS);
  return client.apply(res);
}
