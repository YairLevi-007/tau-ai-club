// Attendance reads for the admin views and the member's profile. RLS decides what comes back:
// admins see everything; a member sees only their own rows (and no guest counts).

import type { SupabaseClient } from "@supabase/supabase-js";
import { getNow } from "@/lib/events";

type Client = SupabaseClient;
export type AttendanceStatus = "registered" | "checked_in" | "no_show";

export type SeasonEvent = { id: string; slug: string; title_he: string; title_en: string; starts_at: string; ends_at: string; status: string };
export type ImportInfo = {
  event_id: string;
  rows_total: number;
  guests_registered: number;
  guests_checked_in: number;
  imported_at: string;
  /** The session's two uploads (DECISIONS 25.11; migration 20261125000000). */
  before_imported_at?: string | null;
  after_imported_at?: string | null;
};
export type AttendanceCell = { event_id: string; member_id: string; status: AttendanceStatus; checked_in_at: string | null };
export type SeasonCohort = { id: string; slug: string; name_he: string; name_en: string; starts_on: string };

/** The current season: the latest cohort that has started (the same rule as the public site). */
export async function currentCohort(supabase: Client): Promise<SeasonCohort | null> {
  const today = getNow().toISOString().slice(0, 10);
  const { data } = await supabase.from("cohorts").select("id, slug, name_he, name_en, starts_on").order("starts_on", { ascending: false });
  const list = (data ?? []) as SeasonCohort[];
  return list.find((c) => c.starts_on <= today) ?? list.at(-1) ?? null;
}

/** Per event: the import log row (admins only) and every member row. */
export async function getEventAttendance(supabase: Client, eventId: string) {
  const [imp, rows] = await Promise.all([
    supabase.from("attendance_imports").select("*").eq("event_id", eventId).maybeSingle(),
    supabase.from("attendance").select("member_id, status, checked_in_at, members!attendance_member_id_fkey(full_name)").eq("event_id", eventId),
  ]);
  const members = ((rows.data ?? []) as unknown as { member_id: string; status: AttendanceStatus; checked_in_at: string | null; members: { full_name: string } | null }[])
    .map((r) => ({ member_id: r.member_id, status: r.status, checked_in_at: r.checked_in_at, full_name: r.members?.full_name ?? "" }))
    .sort((a, b) => a.status.localeCompare(b.status) || a.full_name.localeCompare(b.full_name));
  return { info: (imp.data as ImportInfo | null) ?? null, members, error: Boolean(imp.error || rows.error) };
}

/**
 * The season grid (admins): every member × every event of the season that has started.
 * A cell is a member's row for that event, or nothing (no import yet, or not registered).
 * Rate = checked in ÷ events with an import.
 */
export async function getSeasonAttendance(supabase: Client, cohortId: string) {
  const now = getNow().toISOString();
  const [ev, mem, imp] = await Promise.all([
    supabase.from("events").select("id, slug, title_he, title_en, starts_at, ends_at, status").eq("cohort_id", cohortId).lte("starts_at", now).order("starts_at"),
    supabase.from("members").select("id, full_name").order("full_name"),
    supabase.from("attendance_imports").select("event_id, rows_total, guests_registered, guests_checked_in, imported_at"),
  ]);
  const events = (ev.data ?? []) as SeasonEvent[];
  const ids = events.map((e) => e.id);
  const att = ids.length ? await supabase.from("attendance").select("event_id, member_id, status, checked_in_at").in("event_id", ids) : { data: [], error: null };
  const imports = new Map(((imp.data ?? []) as ImportInfo[]).filter((i) => ids.includes(i.event_id)).map((i) => [i.event_id, i]));
  const cells = new Map<string, AttendanceCell>();
  for (const c of (att.data ?? []) as AttendanceCell[]) cells.set(`${c.member_id}:${c.event_id}`, c);
  const members = ((mem.data ?? []) as { id: string; full_name: string }[]).map((m) => {
    const attended = events.filter((e) => cells.get(`${m.id}:${e.id}`)?.status === "checked_in").length;
    return { ...m, attended, rate: imports.size ? attended / imports.size : null };
  });
  return { events, members, imports, cells, error: Boolean(ev.error || mem.error || imp.error || att.error) };
}

/** One member's history in a season (admins: anyone; a member: themselves, through RLS). */
export async function getMemberAttendance(supabase: Client, memberId: string, cohortId: string) {
  const { data, error } = await supabase
    .from("attendance")
    .select("event_id, status, checked_in_at, events!inner(id, slug, title_he, title_en, starts_at, ends_at, cohort_id)")
    .eq("member_id", memberId)
    .eq("events.cohort_id", cohortId);
  const rows = ((data ?? []) as unknown as { status: AttendanceStatus; checked_in_at: string | null; events: SeasonEvent & { cohort_id: string } }[])
    .map((r) => ({ status: r.status, checked_in_at: r.checked_in_at, event: r.events }))
    .sort((a, b) => a.event.starts_at.localeCompare(b.event.starts_at));
  return { rows, error: Boolean(error) };
}

// ---- Two Luma uploads per session (DECISIONS 25.11) --------------------------------------------
// Before the session: who registered (feeds the pAIr round). After it: who came. The import
// itself is unchanged; the database stamps each upload "before" or "after" by the session's end,
// the same rule that makes going-but-not-checked-in "registered" before and "no-show" after.

import { uploadPhase, uploadTimes, type UploadPhase } from "./phases";
export { uploadPhase, uploadTimes, type UploadPhase };

export type SessionUploads = { event: SeasonEvent; info: ImportInfo | null; phase: UploadPhase; next: boolean; before: string | null; after: string | null };

/** Every published session of the season with its two uploads; `next` marks the first one not over yet. */
export async function getSeasonUploads(supabase: Client, cohortId: string) {
  const now = getNow().toISOString();
  const [ev, imp] = await Promise.all([
    supabase.from("events").select("id, slug, title_he, title_en, starts_at, ends_at, status").eq("cohort_id", cohortId).eq("status", "published").order("starts_at"),
    supabase.from("attendance_imports").select("*"),
  ]);
  const events = (ev.data ?? []) as SeasonEvent[];
  const imports = new Map(((imp.data ?? []) as ImportInfo[]).map((i) => [i.event_id, i]));
  const nextId = events.find((e) => uploadPhase(e, now) === "before")?.id;
  const sessions: SessionUploads[] = events.map((e) => {
    const info = imports.get(e.id) ?? null;
    return { event: e, info, phase: uploadPhase(e, now), next: e.id === nextId, ...uploadTimes(info, e) };
  });
  return { sessions, now, error: Boolean(ev.error || imp.error) };
}
