import "server-only";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Locale } from "@/i18n/routing";
import { localized } from "@/lib/auth/route-client";
import { MEMBER_HINT_COOKIE, MEMBER_HINT_OPTIONS } from "@/lib/auth/otp";

type Membership = { full_name: string; role: string; first_login: boolean };

/**
 * After a session exists (email code or Google): ask the database whether this verified
 * email is on the allowlist (claim_membership) and pick where to go:
 *   not on the list → /members-only
 *   first login     → /welcome (then on to `next`)
 *   otherwise       → `next`
 * Returns null when the claim itself failed.
 */
export async function afterSignIn(supabase: SupabaseClient, origin: string, locale: Locale, next: string) {
  const to = (path: string) => new URL(path, origin);
  const { data: rows, error } = await supabase.rpc("claim_membership");
  if (error) return null;
  const membership = (Array.isArray(rows) ? rows[0] : null) as Membership | null;

  if (!membership) {
    const res = NextResponse.redirect(to(localized(locale, "/members-only")), 303);
    res.cookies.delete(MEMBER_HINT_COOKIE);
    return res;
  }
  let res: NextResponse;
  if (membership.first_login) {
    const welcome = to(localized(locale, "/welcome"));
    welcome.searchParams.set("next", next);
    res = NextResponse.redirect(welcome, 303);
  } else {
    // `next` is locale-free ("/admin/members"); put the locale back in front.
    res = NextResponse.redirect(to(localized(locale, next)), 303);
  }
  res.cookies.set(MEMBER_HINT_COOKIE, "1", MEMBER_HINT_OPTIONS);
  return res;
}
