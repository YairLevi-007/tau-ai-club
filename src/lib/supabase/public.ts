import "server-only";
import { createServerClient } from "@supabase/ssr";

/**
 * Cookie-less Supabase client for PUBLIC reads on the server (anon role, RLS applies).
 *
 * It never reads request cookies, so pages that use it can be statically
 * rendered and revalidated (ISR). Use `./server.ts` (cookie-aware) only in
 * pages that need the signed-in user (Milestone 2+).
 *
 * Returns null when the env vars are missing (e.g. before the Supabase projects exist).
 */
export function createPublicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;

  return createServerClient(url, key, {
    cookies: {
      getAll: () => [],
      setAll: () => {},
    },
  });
}
