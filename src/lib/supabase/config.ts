import type { CookieOptionsWithName } from "@supabase/ssr";

/** Supabase URL + publishable key, or null before the Supabase projects exist. */
export function supabaseEnv(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  return url && key ? { url, key } : null;
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
