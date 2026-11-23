import type { CookieOptionsWithName } from "@supabase/ssr";

/** Supabase URL + publishable key, or null before the Supabase projects exist. */
export function supabaseEnv(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  return url && key ? { url, key } : null;
}

/**
 * The members/admin area is switched on only when ALL of these hold:
 *   - AUTH_ENABLED=true (set it once Google sign-in is configured in Supabase; the app
 *     can't detect the Google provider by itself),
 *   - the Supabase URL + publishable key are set,
 *   - the site isn't in the temporary seed launch mode (DATA_SOURCE=seed).
 * Otherwise every visitor is a guest: no session refresh, no cookie-aware Supabase
 * client, sign-in links hidden, and members/admin routes show a "coming soon" page.
 * This lets `main` carry the auth code before Supabase Auth and Google OAuth exist.
 */
export function authEnabled(): boolean {
  return process.env.AUTH_ENABLED === "true" && supabaseEnv() !== null && process.env.DATA_SOURCE !== "seed";
}

/** Locale-free route prefixes that belong to the members/admin area. */
export const AUTH_AREA_PREFIXES = ["/login", "/members-only", "/welcome", "/me", "/profile", "/members", "/admin", "/speaker", "/initiatives", "/lessons"] as const;

/** "/admin/events" → true, "/events/x" → false, "/membership" → false. Path is locale-free. */
export function isAuthArea(path: string): boolean {
  return AUTH_AREA_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

/**
 * Auth cookies are HttpOnly: the site has no browser-side Supabase client, so page
 * scripts never need the tokens (and an XSS can't read them). Secure outside dev.
 */
export const AUTH_COOKIE_OPTIONS: CookieOptionsWithName = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
};

/** Supabase auth cookies are named `sb-<project-ref>-auth-token[.N]`. */
export const hasAuthCookie = (names: string[]) => names.some((n) => n.startsWith("sb-") && n.includes("-auth-token"));
