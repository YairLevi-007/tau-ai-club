import "server-only";
import { cache } from "react";
import { createPublicClient } from "@/lib/supabase/public";
import type { ClubEvent, Cohort, EventState, Season, SeasonEvent, TeamMember } from "@/lib/data/types";

const EVENT_COLUMNS = `
  id, slug, kind, series, series_no, title_he, title_en, blurb_he, blurb_en,
  starts_at, ends_at, venue_note_he, venue_note_en, luma_url, is_tentative, updated_at,
  venue:venues ( id, name_he, name_en, address_he, address_en, maps_url ),
  event_speakers ( sort, speaker:speakers ( id, slug, name_he, name_en, company_he, company_en, role_he, role_en, photo_url, linkedin_url ) )
`;

/**
 * "Now" for event logic. Outside production, `DEBUG_NOW` (any ISO date) pins the
 * clock so QA can test boundaries (e.g. DEBUG_NOW=2026-11-18T20:00:00+02:00).
 */
export function getNow(): Date {
  const override = process.env.DEBUG_NOW;
  if (override && process.env.VERCEL_ENV !== "production") {
    const d = new Date(override);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

/** Fixtures are generated from supabase/seed.sql (`pnpm db:fixtures`). Never used in production. */
function fixturesAllowed() {
  return process.env.USE_FIXTURES === "1" && process.env.VERCEL_ENV !== "production";
}

/**
 * TEMPORARY launch mode, until the Supabase projects exist: `DATA_SOURCE=seed` serves the
 * season from the committed seed (src/lib/data/fixtures.json, generated from seed.sql),
 * production included. It must be set explicitly: with no Supabase vars and no flag the site
 * still reports "not configured". Remove this (and the env var) once Supabase is live.
 */
export function seedMode() {
  return process.env.DATA_SOURCE === "seed";
}
let seedWarned = false;

async function loadFixtures(): Promise<{ cohort: Cohort; events: ClubEvent[]; team: TeamMember[] }> {
  return (await import("@/lib/data/fixtures.json")).default as unknown as {
    cohort: Cohort;
    events: ClubEvent[];
    team: TeamMember[];
  };
}

function sortSpeakers(e: ClubEvent): ClubEvent {
  return { ...e, event_speakers: [...(e.event_speakers ?? [])].sort((a, b) => a.sort - b.sort) };
}

/**
 * Pure: given events and a moment, mark each as past / live / next / upcoming.
 * The next event is the first one (by start time) that hasn't ended yet. It is
 * "live" while it's running (it stays the Next event until it ends at 20:00).
 */
export function classifyEvents(events: ClubEvent[], now: Date): { events: SeasonEvent[]; next: SeasonEvent | null } {
  const t = now.getTime();
  const sorted = [...events].sort(
    (a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at) || a.slug.localeCompare(b.slug),
  );
  let nextFound = false;
  const out = sorted.map((e): SeasonEvent => {
    let state: EventState;
    if (Date.parse(e.ends_at) <= t) state = "past";
    else if (!nextFound) {
      nextFound = true;
      state = Date.parse(e.starts_at) <= t ? "live" : "next";
    } else state = "upcoming";
    return { ...sortSpeakers(e), state };
  });
  return { events: out, next: out.find((e) => e.state === "next" || e.state === "live") ?? null };
}

async function fetchCurrentSeason(): Promise<
  { cohort: Cohort | null; events: ClubEvent[] } | { error: "not-configured" | "error" }
> {
  if (seedMode()) {
    if (!seedWarned) console.warn("[events] DATA_SOURCE=seed: serving the season from the committed seed, not Supabase (temporary launch mode).");
    seedWarned = true;
    const { cohort, events } = await loadFixtures();
    return { cohort, events };
  }
  // An explicit USE_FIXTURES=1 (local/QA only) wins even when Supabase env is set, so the
  // members-area specs can run auth code against a fake Supabase URL on seed data.
  if (fixturesAllowed()) {
    const { cohort, events } = await loadFixtures();
    return { cohort, events };
  }
  const supabase = createPublicClient();
  if (!supabase) {
    console.error("[events] Supabase env vars missing; set them, or DATA_SOURCE=seed for the temporary seed launch (USE_FIXTURES=1 in local dev).");
    return { error: "not-configured" };
  }

  // Current cohort = the most recent one that has started (falls back to the earliest upcoming).
  const today = getNow().toISOString().slice(0, 10);
  const { data: cohorts, error: cohortError } = await supabase
    .from("cohorts")
    .select("id, slug, name_he, name_en, tagline_he, tagline_en, starts_on, ends_on")
    .order("starts_on", { ascending: false });
  if (cohortError) {
    console.error("[events] cohorts query failed", cohortError);
    return { error: "error" };
  }
  const list = (cohorts ?? []) as Cohort[];
  const cohort = list.find((c) => c.starts_on <= today) ?? list.at(-1) ?? null;
  if (!cohort) return { cohort: null, events: [] };

  const { data, error } = await supabase
    .from("events")
    .select(EVENT_COLUMNS)
    .eq("cohort_id", cohort.id)
    .order("starts_at", { ascending: true });
  if (error) {
    console.error("[events] events query failed", error);
    return { error: "error" };
  }
  return { cohort, events: (data ?? []) as unknown as ClubEvent[] };
}

/** The whole current season, classified against "now". Deduped per request. */
export const getSeason = cache(async (): Promise<Season> => {
  const res = await fetchCurrentSeason();
  if ("error" in res) return { status: "unavailable", reason: res.error };
  const now = getNow();
  const { events, next } = classifyEvents(res.events, now);
  return { status: "ok", cohort: res.cohort, events, next, now: now.toISOString() };
});

/** The first published event that hasn't ended yet (null if none). */
export async function getNextEvent(): Promise<SeasonEvent | null> {
  const season = await getSeason();
  return season.status === "ok" ? season.next : null;
}

/** One event by slug, with its state in the season. */
export async function getEventBySlug(slug: string): Promise<SeasonEvent | null> {
  const season = await getSeason();
  if (season.status !== "ok") return null;
  return season.events.find((e) => e.slug === slug) ?? null;
}

/** Slugs to prerender at build time. */
export async function getEventSlugs(): Promise<string[]> {
  const season = await getSeason();
  return season.status === "ok" ? season.events.map((e) => e.slug) : [];
}

/**
 * The club's founders (home page), published only, in order. Same sources as the season
 * (seed mode, local fixtures, or Supabase). On any failure: an empty list, and the
 * section is simply not shown.
 */
export const getTeam = cache(async (): Promise<TeamMember[]> => {
  if (seedMode()) return (await loadFixtures()).team ?? [];
  const supabase = createPublicClient();
  if (!supabase) return fixturesAllowed() ? ((await loadFixtures()).team ?? []) : [];
  const { data, error } = await supabase
    .from("club_team")
    .select("id, slug, name_he, name_en, role_en, company_en, photo_url, linkedin_url, sort")
    .order("sort", { ascending: true });
  if (error) {
    console.error("[team] club_team query failed", error);
    return [];
  }
  return (data ?? []) as TeamMember[];
});
