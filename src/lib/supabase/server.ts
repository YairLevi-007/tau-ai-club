import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { AUTH_COOKIE_OPTIONS, authEnabled, supabaseEnv } from "./config";

/**
 * Cookie-aware Supabase client for Server Components, Server Actions and Route
 * Handlers that act as the signed-in user. Using it makes the route dynamic, so
 * keep public pages on `./public.ts`.
 *
 * Returns null when auth is off (see authEnabled(): no AUTH_ENABLED, no Supabase
 * env, or seed mode): callers treat that as "signed out", so no member data is read.
 */
export async function createClient() {
  const env = supabaseEnv();
  if (!env || !authEnabled()) return null;
  const cookieStore = await cookies();

  return createServerClient(env.url, env.key, {
    cookieOptions: AUTH_COOKIE_OPTIONS,
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component: cookies are read-only there.
          // src/proxy.ts refreshes the session before the page renders instead.
        }
      },
    },
  });
}
