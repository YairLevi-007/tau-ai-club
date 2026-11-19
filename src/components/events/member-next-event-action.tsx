"use server";

import { hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { getViewer } from "@/lib/auth/viewer";
import { getSeason } from "@/lib/events";
import { authEnabled } from "@/lib/supabase/config";
import { NextEventCard } from "./next-event-card";

/**
 * The Next event card for a signed-in member, rendered on the server (design review item 5).
 *
 * The home page is ISR and the same for everyone, and the schedule is members only
 * (DECISIONS 18.11), so the card can't be in its HTML. The home page's island calls this
 * Server Function after load. Every call is its own POST, never cached, and anyone can
 * send it, so membership is checked here, from the database (`getViewer()` →
 * `current_member()`), not from the island's hint cookie. Guests, non-members and bad
 * input get `null` and nothing else.
 */
export async function memberNextEvent(locale: string) {
  if (!authEnabled() || typeof locale !== "string" || !hasLocale(routing.locales, locale)) return null;
  const viewer = await getViewer();
  if (viewer.kind !== "member") return null;

  setRequestLocale(locale);
  const season = await getSeason();
  if (season.status !== "ok") return null;
  const next = season.next;
  const seriesTotal = next?.series ? season.events.filter((e) => e.series === next.series).length : undefined;
  return <NextEventCard event={next} now={season.now} seriesTotal={seriesTotal} />;
}
