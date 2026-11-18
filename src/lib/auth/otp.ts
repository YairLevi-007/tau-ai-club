import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { supabaseEnv } from "@/lib/supabase/config";

/**
 * Email + 6-digit code sign-in helpers (see /api/auth/otp and /api/auth/verify).
 *
 * The pending email lives in a short-lived HttpOnly cookie scoped to /api/auth, so it
 * never appears in a URL, the page HTML or browser history.
 */
export const OTP_EMAIL_COOKIE = "tau_otp_email";
export const OTP_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/api/auth",
  maxAge: 15 * 60,
};

/**
 * UI hint only (NOT a security boundary): set after a member signs in, so the cached
 * public header can show the members' links. Pages and RLS still check membership.
 */
export const MEMBER_HINT_COOKIE = "tau_member";
export const MEMBER_HINT_OPTIONS = {
  httpOnly: false,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
};

export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (email.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return null;
  return email;
}

/** Supabase sends 6 digits by default (configurable up to 10). */
export function normalizeCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.replace(/[\s-]/g, "");
  return /^\d{6,10}$/.test(code) ? code : null;
}

/** Same-origin form posts only. */
export function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  return !origin || origin === request.nextUrl.origin;
}

export function clientIp(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

// ---------------------------------------------------------------------------
// Throttle: a simple fixed window per key, in this server instance's memory. Supabase's
// own auth rate limits (per email and per IP) stay the real backstop.
// ---------------------------------------------------------------------------
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export const LIMITS = {
  requestPerIp: { max: 8, windowMs: 10 * 60_000 },
  requestPerEmail: { max: 3, windowMs: 10 * 60_000 },
  verifyPerIp: { max: 15, windowMs: 10 * 60_000 },
  verifyPerEmail: { max: 6, windowMs: 10 * 60_000 },
} as const;

/** Counts one attempt; false when the key is over its limit. */
export function allow(key: string, limit: { max: number; windowMs: number }, now = Date.now()) {
  if (buckets.size > 5000) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + limit.windowMs });
    return true;
  }
  b.count++;
  return b.count <= limit.max;
}

/**
 * Is this email on the club list (an active member)? Checked with the server-only
 * secret key, because the allowlist is admins-only under RLS.
 *
 * Returns null when SUPABASE_SECRET_KEY isn't set: the caller then relies on the
 * before_user_created hook alone, which still refuses to create unlisted users.
 */
export async function isAllowlisted(email: string): Promise<boolean | null> {
  const env = supabaseEnv();
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!env || !secret) return null;
  const admin = createClient(env.url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  // An RPC (POST body), so the email never lands in a URL or the API request logs.
  const { data, error } = await admin.rpc("email_on_club_list", { p_email: email });
  if (error) throw new Error(`allowlist lookup failed: ${error.code ?? "unknown"}`);
  return data === true;
}
