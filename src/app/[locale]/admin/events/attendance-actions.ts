"use server";

import { revalidatePath } from "next/cache";
import { adminClient } from "@/lib/auth/viewer";
import type { AttendanceRow } from "@/lib/attendance/luma-csv";
import { uploadPhase, type UploadPhase } from "@/lib/attendance/phases";
import { getNow } from "@/lib/events";

export type AttendanceStatus = "registered" | "checked_in" | "no_show";
export type AttendanceResult = {
  members: { member_id: string; full_name: string; status: AttendanceStatus; checked_in_at: string | null; self_added?: boolean }[];
  rows_total: number;
  ignored: number;
  guests_registered: number;
  guests_checked_in: number;
  committed: boolean;
  /**
   * The upload's emails that matched no member (25.11), echoed back from what the browser sent so
   * the admin can link them. Never stored (see migration 20261126000000). Absent before it.
   */
  unmatched?: string[];
};
export type ImportAttendanceResult = { ok: true; result: AttendanceResult } | { ok: false; error: "invalid" | "failed" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/**
 * Attendance from a Luma guest export, already read in the browser (email, going, check-in
 * only). `commit: false` previews the match against the member list; `commit: true` replaces
 * the event's attendance. Non-member guests are only counted, never stored (see the SQL).
 */
const cleanRows = (rows: AttendanceRow[]) =>
  rows.map((r) => ({
    email: String(r?.email ?? "").trim().toLowerCase().slice(0, 254),
    going: r?.going === true,
    checked_in: r?.checked_in === true,
    checked_in_at: typeof r?.checked_in_at === "string" && ISO.test(r.checked_in_at) ? r.checked_in_at : null,
  }));

export async function importAttendance(eventId: string, rows: AttendanceRow[], commit: boolean): Promise<ImportAttendanceResult> {
  const supabase = await adminClient();
  if (typeof eventId !== "string" || !UUID.test(eventId) || !Array.isArray(rows) || rows.length > 5000) return { ok: false, error: "invalid" };
  const { data, error } = await supabase.rpc("admin_import_attendance", { p_event_id: eventId, p_rows: cleanRows(rows), p_commit: commit === true });
  if (error || !data) {
    console.error("[attendance] import failed", error?.code);
    return { ok: false, error: "failed" };
  }
  if (commit) {
    revalidatePath("/[locale]/admin/events/[id]", "page");
    revalidatePath("/[locale]/admin/attendance", "layout");
    revalidatePath("/[locale]/profile", "page");
  }
  return { ok: true, result: data as AttendanceResult };
}

// ---- Linking an unmatched Luma email to a member (25.11) ---------------------------------------

export type LinkableMember = { id: string; full_name: string };

/** Active members, for the admin's "who is this?" picker. Names and ids only. */
export async function membersForLinking(): Promise<LinkableMember[]> {
  const supabase = await adminClient();
  const { data } = await supabase.from("members").select("id, full_name").eq("status", "active").order("full_name");
  return (data ?? []) as LinkableMember[];
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export type LinkResult =
  | { ok: true; result: AttendanceResult | null; reimported: boolean }
  | { ok: false; error: "invalid" | "taken" | "failed" };

/**
 * Links a Luma email to a member (member_luma_emails: used only to match uploads, never to sign
 * in), so every later upload matches them. Then, while the session is still in the same phase as
 * the upload, runs the same upload again with the rows the browser still holds (preview or save,
 * as it was), so the attendance updates at once through the unchanged import. Once the session
 * has ended since, it only links: the admin's "after" upload picks the member up.
 */
export async function linkLumaEmail(input: {
  eventId: string;
  email: string;
  memberId: string;
  rows: AttendanceRow[];
  commit: boolean;
  phase?: UploadPhase;
}): Promise<LinkResult> {
  const supabase = await adminClient();
  const email = String(input?.email ?? "").normalize("NFKC").trim().toLowerCase();
  const { eventId, memberId, rows } = input ?? {};
  if (!EMAIL.test(email) || email.length > 254 || !UUID.test(String(memberId)) || !UUID.test(String(eventId)) || !Array.isArray(rows) || rows.length > 5000) {
    return { ok: false, error: "invalid" };
  }
  // Already somebody's sign-in email, or linked before (by match key, so a Gmail dot variant
  // counts): fine if it's the same member.
  const { data: owner, error: ownerError } = await supabase.rpc("admin_email_owner", { p_email: email });
  if (ownerError) {
    console.error("[attendance] owner check failed", ownerError.code);
    return { ok: false, error: "failed" };
  }
  if (owner && owner !== memberId) return { ok: false, error: "taken" };
  if (!owner) {
    const { error } = await supabase.from("member_luma_emails").insert({ email, member_id: memberId });
    if (error) {
      console.error("[attendance] link failed", error.code);
      return { ok: false, error: error.code === "23505" ? "taken" : "failed" };
    }
  }

  const { data: ev } = await supabase.from("events").select("ends_at").eq("id", eventId).maybeSingle();
  const now = getNow().toISOString();
  if (!ev || (input.phase && uploadPhase(ev as { ends_at: string }, now) !== input.phase)) return { ok: true, result: null, reimported: false };
  const commit = input.commit === true;
  const { data, error } = await supabase.rpc("admin_import_attendance", { p_event_id: eventId, p_rows: cleanRows(rows), p_commit: commit });
  if (error || !data) {
    console.error("[attendance] re-run after link failed", error?.code);
    return { ok: true, result: null, reimported: false };
  }
  if (commit) {
    revalidatePath("/[locale]/admin/events/[id]", "page");
    revalidatePath("/[locale]/admin/attendance", "layout");
    revalidatePath("/[locale]/profile", "page");
  }
  return { ok: true, result: data as AttendanceResult, reimported: true };
}
