"use server";

import { revalidatePath } from "next/cache";
import { adminClient } from "@/lib/auth/viewer";
import type { AttendanceRow } from "@/lib/attendance/luma-csv";

export type AttendanceStatus = "registered" | "checked_in" | "no_show";
export type AttendanceResult = {
  members: { member_id: string; full_name: string; status: AttendanceStatus; checked_in_at: string | null }[];
  rows_total: number;
  ignored: number;
  guests_registered: number;
  guests_checked_in: number;
  committed: boolean;
};
export type ImportAttendanceResult = { ok: true; result: AttendanceResult } | { ok: false; error: "invalid" | "failed" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/**
 * Attendance from a Luma guest export, already read in the browser (email, going, check-in
 * only). `commit: false` previews the match against the member list; `commit: true` replaces
 * the event's attendance. Non-member guests are only counted, never stored (see the SQL).
 */
export async function importAttendance(eventId: string, rows: AttendanceRow[], commit: boolean): Promise<ImportAttendanceResult> {
  const supabase = await adminClient();
  if (typeof eventId !== "string" || !UUID.test(eventId) || !Array.isArray(rows) || rows.length > 5000) return { ok: false, error: "invalid" };
  const clean = rows.map((r) => ({
    email: String(r?.email ?? "").trim().toLowerCase().slice(0, 254),
    going: r?.going === true,
    checked_in: r?.checked_in === true,
    checked_in_at: typeof r?.checked_in_at === "string" && ISO.test(r.checked_in_at) ? r.checked_in_at : null,
  }));
  const { data, error } = await supabase.rpc("admin_import_attendance", { p_event_id: eventId, p_rows: clean, p_commit: commit === true });
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
