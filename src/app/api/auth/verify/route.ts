import { NextResponse, type NextRequest } from "next/server";
import { afterSignIn } from "@/lib/auth/finish";
import { safeNext } from "@/lib/auth/next-path";
import { localeParam, localized, routeClient } from "@/lib/auth/route-client";
import {
  LIMITS,
  OTP_COOKIE_OPTIONS,
  OTP_EMAIL_COOKIE,
  allow,
  clientIp,
  normalizeCode,
  normalizeEmail,
  sameOrigin,
} from "@/lib/auth/otp";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/verify (form: code, locale, next): "Member log in", step 2.
 * The email comes from the HttpOnly cookie set in step 1. verifyOtp({ type: "email" })
 * creates the session cookies; afterSignIn() then checks the allowlist in the database.
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

  const email = normalizeEmail(request.cookies.get(OTP_EMAIL_COOKIE)?.value);
  // The 15-minute step-1 cookie expired (or was never set): start over.
  if (!email) return client.apply(NextResponse.redirect(login({ error: "expired" }), 303));

  const code = normalizeCode(field("code"));
  if (!code) return client.apply(NextResponse.redirect(login({ sent: "1", error: "code" }), 303));

  if (!allow(`ver:ip:${clientIp(request)}`, LIMITS.verifyPerIp) || !allow(`ver:email:${email}`, LIMITS.verifyPerEmail)) {
    return client.apply(NextResponse.redirect(login({ sent: "1", error: "throttled" }), 303));
  }

  const { error } = await client.supabase.auth.verifyOtp({ email, token: code, type: "email" });
  if (error) return client.apply(NextResponse.redirect(login({ sent: "1", error: "code" }), 303));

  const res = await afterSignIn(client.supabase, request.nextUrl.origin, locale, next);
  if (!res) return client.apply(NextResponse.redirect(login({ error: "failed" }), 303));
  res.cookies.set(OTP_EMAIL_COOKIE, "", { ...OTP_COOKIE_OPTIONS, maxAge: 0 });
  return client.apply(res);
}
