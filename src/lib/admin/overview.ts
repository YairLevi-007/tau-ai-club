// The admin home's numbers (DECISIONS 25.11): members, attendance per session, the next session
// and its Luma uploads, and what needs attention. Reads only, with the admin's own client: RLS
// decides what comes back (every table here is admins-only or admin-readable).

import type { SupabaseClient } from "@supabase/supabase-js";
import { currentCohort, getSeasonAttendance, getSeasonUploads, type SeasonCohort, type SessionUploads } from "@/lib/attendance/data";

export type SessionAttendance = { session: SessionUploads; members: number; guests: number; imported: boolean };

export type Attention =
  | { kind: "after_missing"; session: SessionUploads }
  | { kind: "before_missing"; session: SessionUploads }
  | { kind: "initiatives_pending"; n: number };

export type AdminOverview = {
  cohort: SeasonCohort | null;
  members: { total: number; admins: number; signedIn: number };
  next: SessionUploads | null;
  sessions: SessionAttendance[];
  attention: Attention[];
  error: boolean;
};

export async function getAdminOverview(supabase: SupabaseClient): Promise<AdminOverview> {
  const cohort = await currentCohort(supabase);
  const [mem, uploads, season, pending] = await Promise.all([
    supabase.from("members").select("id, role, profiles ( welcomed_at )"),
    cohort ? getSeasonUploads(supabase, cohort.id) : null,
    cohort ? getSeasonAttendance(supabase, cohort.id) : null,
    supabase.from("initiatives").select("id", { count: "exact", head: true }).eq("status", "pending"),
  ]);

  const rows = (mem.data ?? []) as unknown as { id: string; role: string; profiles: { welcomed_at: string | null } | { welcomed_at: string | null }[] | null }[];
  const welcomed = (p: (typeof rows)[number]["profiles"]) => (Array.isArray(p) ? p.some((x) => x.welcomed_at) : Boolean(p?.welcomed_at));
  const members = { total: rows.length, admins: rows.filter((r) => r.role === "admin").length, signedIn: rows.filter((r) => welcomed(r.profiles)).length };

  const all = uploads?.sessions ?? [];
  const next = all.find((s) => s.next) ?? null;
  const past = all.filter((s) => s.phase === "after");

  // Per past session: members checked in (from the attendance rows) and guests checked in (counts only).
  const checkedIn = new Map<string, number>();
  for (const c of season?.cells.values() ?? []) if (c.status === "checked_in") checkedIn.set(c.event_id, (checkedIn.get(c.event_id) ?? 0) + 1);
  const sessions = [...past].reverse().map((s) => ({
    session: s,
    members: checkedIn.get(s.event.id) ?? 0,
    guests: s.info?.guests_checked_in ?? 0,
    imported: Boolean(s.after),
  }));

  const attention: Attention[] = [];
  if (next && !next.before) attention.push({ kind: "before_missing", session: next });
  for (const s of [...past].reverse()) if (!s.after) attention.push({ kind: "after_missing", session: s });
  if (pending.count) attention.push({ kind: "initiatives_pending", n: pending.count });

  return {
    cohort,
    members,
    next,
    sessions,
    attention,
    error: Boolean(mem.error || uploads?.error || season?.error || pending.error),
  };
}
