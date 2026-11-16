import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";
import { hasLocale } from "next-intl";
import { routing, type Locale } from "@/i18n/routing";
import { AUTH_COOKIE_OPTIONS, supabaseEnv } from "@/lib/supabase/config";

type PendingCookie = { name: string; value: string; options: object };

/**
 * Supabase client for the /api/auth/* route handlers. Cookies it sets are collected
 * and applied to whatever response the handler returns (`apply(res)`).
 */
export function routeClient(request: NextRequest) {
  const env = supabaseEnv();
  if (!env) return null;
  const pending: PendingCookie[] = [];
  const supabase = createServerClient(env.url, env.key, {
    cookieOptions: AUTH_COOKIE_OPTIONS,
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => toSet.forEach((c) => pending.push(c)),
    },
  });
  const apply = (res: NextResponse) => {
    for (const { name, value, options } of pending) res.cookies.set(name, value, options);
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  };
  return { supabase, apply };
}

export function localeParam(value: string | null | undefined): Locale {
  return hasLocale(routing.locales, value) ? value : routing.defaultLocale;
}

/** "/login" → "/login" (he) or "/en/login" (en). Same as seo.ts localizedPath. */
export function localized(locale: Locale, path: string) {
  if (locale === routing.defaultLocale) return path;
  return path === "/" ? `/${locale}` : `/${locale}${path}`;
}
