import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProfileLinks } from "@/lib/members/profile";
import type { PairMark, PairRound } from "./match";

// pAIr reads. Admins read the tables directly (RLS: admins only); a member gets only their own
// published conversations through my_pair_matches().

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PairPerson = {
  id: string;
  full_name: string;
  photo_url: string | null;
  year: number | null;
  faculty: string | null;
  program: string | null;
  bio_he: string | null;
  bio_en: string | null;
  links: ProfileLinks;
};

export type PairEvent = { id: string; slug: string; title_he: string; title_en: string; starts_at: string; ends_at: string };

export type AdminRound = Omit<PairRound, "groups"> & {
  event: PairEvent;
  published_at: string | null;
  groups: { id: string; members: string[]; mark: PairMark }[];
  /** Who is coming, with where they came from. */
  people: Map<string, "luma" | "manual">;
};

type RoundRow = { id: string; event_id: string; status: "draft" | "published"; published_at: string | null };
type GroupRow = { id: string; round_id: string; sort: number; mark: PairMark };
type GroupMemberRow = { group_id: string; round_id: string; member_id: string };
type PeopleRow = { round_id: string; member_id: string; source: "luma" | "manual" };
type ConfirmRow = { round_id: string; member_id: string; confirmed_at: string };

/**
 * Every round with its meetup, conversations, list and confirmations, plus every active member's
 * profile (admins only). One read for the whole admin area: the club is small.
 */
export async function getPairAdminData(supabase: SupabaseClient) {
  const [rounds, groups, members, people, confirms, profiles] = await Promise.all([
    supabase.from("pair_rounds").select("id, event_id, status, published_at"),
    supabase.from("pair_groups").select("id, round_id, sort, mark").order("sort"),
    supabase.from("pair_group_members").select("group_id, round_id, member_id"),
    supabase.from("pair_round_people").select("round_id, member_id, source"),
    supabase.from("pair_confirms").select("round_id, member_id, confirmed_at"),
    supabase
      .from("members")
      .select("id, full_name, status, profiles(photo_url, year, faculty, program, bio_he, bio_en, links)")
      .eq("status", "active")
      .order("full_name"),
  ]);
  const error = Boolean(rounds.error || groups.error || members.error || people.error || confirms.error || profiles.error);
  const roundRows = (rounds.data ?? []) as RoundRow[];
  const eventIds = roundRows.map((r) => r.event_id);
  const events = eventIds.length
    ? await supabase.from("events").select("id, slug, title_he, title_en, starts_at, ends_at").in("id", eventIds)
    : { data: [], error: null };
  const eventById = new Map(((events.data ?? []) as PairEvent[]).map((e) => [e.id, e]));

  const membersByGroup = new Map<string, string[]>();
  for (const m of (members.data ?? []) as GroupMemberRow[]) {
    const list = membersByGroup.get(m.group_id) ?? [];
    list.push(m.member_id);
    membersByGroup.set(m.group_id, list);
  }
  const out: AdminRound[] = roundRows
    .filter((r) => eventById.has(r.event_id))
    .map((r) => {
      const event = eventById.get(r.event_id)!;
      return {
        id: r.id,
        date: event.starts_at,
        status: r.status,
        published_at: r.published_at,
        event,
        groups: ((groups.data ?? []) as GroupRow[])
          .filter((g) => g.round_id === r.id)
          .map((g) => ({ id: g.id, members: (membersByGroup.get(g.id) ?? []).sort(), mark: g.mark })),
        confirms: new Map(((confirms.data ?? []) as ConfirmRow[]).filter((c) => c.round_id === r.id).map((c) => [c.member_id, c.confirmed_at])),
        people: new Map(((people.data ?? []) as PeopleRow[]).filter((p) => p.round_id === r.id).map((p) => [p.member_id, p.source])),
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  type ProfileJoin = Omit<PairPerson, "id" | "full_name">;
  const persons = new Map<string, PairPerson>();
  for (const m of (profiles.data ?? []) as unknown as { id: string; full_name: string; profiles: ProfileJoin | ProfileJoin[] | null }[]) {
    const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
    persons.set(m.id, {
      id: m.id,
      full_name: m.full_name,
      photo_url: p?.photo_url ?? null,
      year: p?.year ?? null,
      faculty: p?.faculty ?? null,
      program: p?.program ?? null,
      bio_he: p?.bio_he ?? null,
      bio_en: p?.bio_en ?? null,
      links: (p?.links ?? {}) as ProfileLinks,
    });
  }
  return { rounds: out, persons, error: error || Boolean(events.error) };
}

/** The meetups of a season that can get a round (admins). */
export async function getSeasonEvents(supabase: SupabaseClient, cohortId: string) {
  const { data, error } = await supabase
    .from("events")
    .select("id, slug, title_he, title_en, starts_at, ends_at")
    .eq("cohort_id", cohortId)
    .eq("status", "published")
    .order("starts_at");
  return { events: (data ?? []) as PairEvent[], error: Boolean(error) };
}

export type MyMatch = {
  round_id: string;
  event_id: string;
  slug: string;
  title_he: string;
  title_en: string;
  starts_at: string;
  published_at: string;
  confirmed_at: string | null;
  partners: PairPerson[];
};

/** The signed-in member's published conversations, newest meetup first. */
export async function getMyMatches(supabase: SupabaseClient): Promise<MyMatch[]> {
  const { data, error } = await supabase.rpc("my_pair_matches");
  if (error || !Array.isArray(data)) return [];
  return (data as MyMatch[]).filter((m) => m && Array.isArray(m.partners));
}
