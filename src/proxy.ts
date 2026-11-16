import { createServerClient } from "@supabase/ssr";
import createMiddleware from "next-intl/middleware";
import type { NextRequest } from "next/server";
import { routing } from "./i18n/routing";
import { AUTH_COOKIE_OPTIONS, hasAuthCookie, supabaseEnv } from "./lib/supabase/config";

// Next 16 renamed middleware.ts to proxy.ts; this is the project's one request hook.
const intl = createMiddleware(routing);

/**
 * 1. Refresh the Supabase session (only when an auth cookie exists, so guests cost
 *    nothing). Refreshed cookies are written onto the request, so the page renders
 *    with the new token, and onto the response, so the browser stores it.
 * 2. Hand off to next-intl for locale routing (it forwards the request headers).
 *
 * This is not a security boundary: pages check membership on the server and RLS
 * enforces it in the database.
 */
export default async function proxy(request: NextRequest) {
  const env = supabaseEnv();
  const pending: { name: string; value: string; options: object }[] = [];

  if (env && hasAuthCookie(request.cookies.getAll().map((c) => c.name))) {
    const supabase = createServerClient(env.url, env.key, {
      cookieOptions: AUTH_COOKIE_OPTIONS,
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            pending.push({ name, value, options });
          });
        },
      },
    });
    // Verifies the JWT and refreshes it when it's about to expire.
    await supabase.auth.getClaims();
  }

  const response = intl(request);
  for (const { name, value, options } of pending) response.cookies.set(name, value, options);
  // A refreshed session must never be cached by a CDN.
  if (pending.length) response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  // Everything except API routes, Next internals, Vercel internals and files with a dot.
  matcher: "/((?!api|trpc|_next|_vercel|.*\..*).*)",
};
