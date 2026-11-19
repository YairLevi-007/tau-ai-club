import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TIME_ZONE } from "@/i18n/routing";

/**
 * Initiatives (יוזמות): the data layer. Members only, so every call takes the cookie-aware client
 * of a member/admin page (never the public one). RLS and the RPCs in
 * supabase/migrations/20261120000000_initiatives.sql decide what each caller gets; nothing here
 * is a security boundary. Who joined comes back as counts, plus names for the lead and admins
 * (initiative_people), never emails.
 */

export const INITIATIVE_CATEGORIES = ["hackathon", "project", "study_group", "volunteering", "other"] as const;
export type InitiativeCategory = (typeof INITIATIVE_CATEGORIES)[number];
export type InitiativeKind = "club" | "member";
export type InitiativeStatus = "pending" | "returned" | "published" | "rejected";

export type Initiative = {
  id: string;
  lead_id: string;
  kind: InitiativeKind;
  /** What the proposer asked for (personal, or a proposal for a club initiative); `kind` is what's shown. */
  proposed_kind: InitiativeKind;
  category: InitiativeCategory;
  status: InitiativeStatus;
  title_he: string | null;
  title_en: string | null;
  summary_he: string | null;
  summary_en: string | null;
  when_text: string | null;
  where_text: string | null;
  spots: number | null;
  signup_until: string | null;
  club_reason_he: string | null;
  club_reason_en: string | null;
  review_note: string | null;
  submitted_at: string;
  published_at: string | null;
  // From initiative_cards():
  lead_name: string;
  lead_photo: string | null;
  joined_count: number;
  i_joined: boolean;
};

export type InitiativePerson = { member_id: string; full_name: string; photo_url: string | null; joined_at: string };

const COLUMNS =
  "id, lead_id, kind, proposed_kind, category, status, title_he, title_en, summary_he, summary_en, when_text, where_text, spots, signup_until, club_reason_he, club_reason_en, review_note, submitted_at, published_at";

type Row = Omit<Initiative, "lead_name" | "lead_photo" | "joined_count" | "i_joined">;
type Card = { initiative_id: string; lead_name: string; lead_photo: string | null; joined_count: number; i_joined: boolean };

const isId = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

/**
 * Every initiative the caller may see: published ones, the caller's own in any state, and for an
 * admin all of them. Newest first. Null when the query fails (show "couldn't load", not "none").
 */
export async function getInitiatives(supabase: SupabaseClient): Promise<Initiative[] | null> {
  const [rows, cards] = await Promise.all([
    supabase.from("initiatives").select(COLUMNS).order("published_at", { ascending: false, nullsFirst: true }).order("submitted_at", { ascending: false }),
    supabase.rpc("initiative_cards"),
  ]);
  if (rows.error || cards.error) return null;
  const byId = new Map(((cards.data ?? []) as Card[]).map((c) => [c.initiative_id, c]));
  return ((rows.data ?? []) as Row[]).map((r) => {
    const c = byId.get(r.id);
    return { ...r, lead_name: c?.lead_name ?? "", lead_photo: c?.lead_photo ?? null, joined_count: c?.joined_count ?? 0, i_joined: c?.i_joined ?? false };
  });
}

/** One initiative the caller may see, or null. */
export async function getInitiative(supabase: SupabaseClient, id: string): Promise<Initiative | null> {
  if (!isId(id)) return null;
  const all = await getInitiatives(supabase);
  return all?.find((i) => i.id === id) ?? null;
}

/** Who's in, by name: only for the initiative's lead and admins (the RPC refuses anyone else). */
export async function getInitiativePeople(supabase: SupabaseClient, id: string): Promise<InitiativePerson[] | null> {
  if (!isId(id)) return null;
  const { data, error } = await supabase.rpc("initiative_people", { p_id: id });
  if (error) return null;
  return (data ?? []) as InitiativePerson[];
}

/** Sign-up is open: published, not full, and the "sign up by" day (Israel time) hasn't passed. */
export function signupOpen(i: Pick<Initiative, "status" | "spots" | "joined_count" | "signup_until">, today: string): boolean {
  if (i.status !== "published") return false;
  if (i.spots != null && i.joined_count >= i.spots) return false;
  return i.signup_until == null || i.signup_until >= today;
}

/** Today's date in Israel ("2026-11-19"), which is what "sign up by" is measured against. */
export const israelToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(new Date());
