import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { authEnabled } from "@/lib/supabase/config";
import { getViewer } from "@/lib/auth/viewer";

/**
 * Who may read the calendar files. Members area off: everyone (the schedule is public then).
 * Members area on: the schedule is members only (docs/OPEN-QUESTIONS.md #1), so a signed-in
 * member, or a calendar app holding the members' feed key. Calendar apps (Google, Apple) fetch
 * subscribed feeds from their own servers without our cookies, so the season feed link in /me
 * carries `?k=<key>`.
 *
 * The key is derived from SUPABASE_SECRET_KEY (server-only), so it needs no extra env var and
 * changes if that secret is rotated. It's one shared key for the cohort: it guards the meeting
 * schedule, not personal data.
 */
export function calendarFeedKey(): string | null {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) return null;
  return createHmac("sha256", secret).update("tau-calendar-feed-v1").digest("base64url").slice(0, 32);
}

function validKey(given: string | null) {
  const want = calendarFeedKey();
  if (!want || !given || given.length !== want.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(want));
}

export async function calendarAllowed(request: NextRequest) {
  if (!authEnabled()) return true;
  if (validKey(request.nextUrl.searchParams.get("k"))) return true;
  const viewer = await getViewer();
  return viewer.kind === "member";
}

export const calendarDenied = () =>
  new Response("Members only", { status: 401, headers: { "Cache-Control": "private, no-store" } });
