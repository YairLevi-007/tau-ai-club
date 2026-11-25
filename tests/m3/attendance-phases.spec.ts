import { expect, test } from "@playwright/test";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { uploadCounts, uploadPhase, uploadTimes } from "../../src/lib/attendance/phases";

// Two Luma uploads per session (DECISIONS 25.11): "before: who registered" (feeds pAIr) and
// "after: who came" (attendance). A better place to upload, not new logic. The database side
// (the before/after stamps, nothing else changing) is checked in scripts/rls-m2-attendance.mjs, 19b.

const ROOT = resolve(__dirname, "../..");
const src = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const ENDS = "2026-11-25T18:00:00+00:00"; // 20:00 Israel time

test.describe("attendance: before and after uploads", () => {
  test.skip(({ isMobile }) => isMobile, "pure check: desktop project only");

  test("a session waits for 'before' until it ends, then for 'after'", () => {
    expect(uploadPhase({ ends_at: ENDS }, "2026-11-25T10:00:00.000Z")).toBe("before");
    expect(uploadPhase({ ends_at: ENDS }, "2026-11-25T17:59:59.000Z")).toBe("before");
    expect(uploadPhase({ ends_at: ENDS }, "2026-11-25T18:00:00.000Z")).toBe("after");
    expect(uploadPhase({ ends_at: ENDS }, "2026-11-26T09:00:00.000Z")).toBe("after");
  });

  test("upload times come from the database stamps, or from the import time before the migration", () => {
    const base = { imported_at: "2026-11-25T19:00:00+00:00" };
    expect(uploadTimes(null, { ends_at: ENDS })).toEqual({ before: null, after: null });
    expect(uploadTimes({ ...base, before_imported_at: "2026-11-25T08:00:00+00:00", after_imported_at: base.imported_at }, { ends_at: ENDS })).toEqual({
      before: "2026-11-25T08:00:00+00:00",
      after: base.imported_at,
    });
    expect(uploadTimes({ ...base, before_imported_at: null, after_imported_at: null }, { ends_at: ENDS })).toEqual({ before: null, after: null });
    // No columns yet: the single import time lands on its side of the session's end.
    expect(uploadTimes(base, { ends_at: ENDS })).toEqual({ before: null, after: base.imported_at });
    expect(uploadTimes({ imported_at: "2026-11-25T08:00:00+00:00" }, { ends_at: ENDS })).toEqual({ before: "2026-11-25T08:00:00+00:00", after: null });
  });

  test("no new logic: the import, its statuses and pAIr's round fill are untouched", () => {
    const migs = readdirSync(resolve(ROOT, "supabase/migrations")).filter((f) => f >= "20261125000000");
    expect(migs).toContain("20261125000000_attendance_phases.sql");
    const sql = src("supabase/migrations/20261125000000_attendance_phases.sql").replace(/^\s*--.*$/gm, "");
    // Only two timestamp columns and the trigger that fills them; no new grants, no redefined functions.
    expect(sql).not.toMatch(/admin_import_attendance|pair_|attendance_status|\bgrant\b/i);
    expect(sql).toMatch(/add column before_imported_at timestamptz/);
    expect(sql).toMatch(/add column after_imported_at\s+timestamptz/);
    expect(sql).toMatch(/revoke all on function public\.attendance_imports_phase\(\) from public, anon, authenticated/);
    // Both places upload through the same component and server call; only the label changes.
    const ui = src("src/components/admin/attendance/attendance-import.tsx");
    expect(ui).toMatch(/importAttendance\(eventId, rows, commit\)/);
    expect(ui).toMatch(/phase === "before" \? t\("pickBefore"\) : phase === "after" \? t\("pickAfter"\) : t\("pick"\)/);
    expect(src("src/components/admin/attendance/session-uploads.tsx")).toMatch(/<AttendanceImport eventId=\{s\.event\.id\} phase=\{s\.phase\} \/>/);
    expect(src("src/components/admin/attendance/attendance-panel.tsx")).toMatch(/<AttendanceImport eventId=\{eventId\} phase=\{phase\} \/>/);
    expect(src("src/app/[locale]/admin/attendance/page.tsx")).toMatch(/await requireAdmin\("\/admin\/attendance"\)/);
  });

  // 25.11: each upload's numbers, to check against Luma (session 3's before upload: 41 / 29 / 12).
  test("each upload's counts come from its own phase; none until it's done", () => {
    expect(uploadCounts(null)).toEqual({ before: null, after: null });
    // Before the migration: no count columns, so nothing is shown (not zeros).
    expect(uploadCounts({})).toEqual({ before: null, after: null });
    expect(uploadCounts({ before_rows_total: 41, before_members: 29, before_guests: 12, after_rows_total: null })).toEqual({
      before: { rows: 41, members: 29, guests: 12 },
      after: null,
    });
    expect(
      uploadCounts({ before_rows_total: 41, before_members: 29, before_guests: 12, after_rows_total: 38, after_members_checked_in: 24, after_guests_checked_in: 9, after_no_shows: 5 }),
    ).toEqual({ before: { rows: 41, members: 29, guests: 12 }, after: { rows: 38, membersIn: 24, guestsIn: 9, noShows: 5 } });
  });

  test("the counts: a trigger stamps them per phase, admins see them on all three pages, counts only", () => {
    const sql = src("supabase/migrations/20261125120000_attendance_phase_counts.sql").replace(/^\s*--.*$/gm, "");
    // The import function, its statuses and pAIr are untouched; no grants (admins read the table through its RLS).
    expect(sql).not.toMatch(/admin_import_attendance|pair_|create type|\bgrant\b|create policy|security definer/i);
    for (const c of ["before_rows_total", "before_members", "before_guests", "after_rows_total", "after_members_checked_in", "after_no_shows", "after_guests_checked_in"]) {
      expect(sql).toMatch(new RegExp(`add column ${c}\\s+int`));
    }
    expect(sql).toMatch(/revoke all on function public\.attendance_imports_phase\(\) from public, anon, authenticated/);
    // Numbers only: no email or name column is read into them.
    expect(sql).not.toMatch(/email|full_name/);
    // The step cards show them wherever the steps are: the uploads list, the event page, the admin home.
    expect(src("src/components/admin/attendance/session-uploads.tsx")).toContain("counts={uploadCounts(s.info)}");
    expect(src("src/components/admin/attendance/attendance-panel.tsx")).toContain("counts={uploadCounts(info)}");
    expect(src("src/app/[locale]/admin/page.tsx")).toContain("counts={uploadCounts(o.next.info)}");
    expect(src("src/app/[locale]/admin/page.tsx")).toMatch(/await requireAdmin\("\/admin"\)/);
  });

  test("the new texts exist in both languages", () => {
    const he = JSON.parse(src("messages/he.json")).attendance;
    const en = JSON.parse(src("messages/en.json")).attendance;
    for (const k of ["pickBefore", "pickAfter", "uploadsTitle", "uploadsBody", "stepBefore", "stepAfter", "stepDone", "stepNotYet", "stepMissed", "stepOpensAfter", "uploadBefore", "uploadAfter", "nextSession", "countsLabel", "countFile", "countMembersRegistered", "countGuestsGoing", "countMembersIn", "countGuestsIn", "countNoShows"]) {
      expect(he[k], k).toBeTruthy();
      expect(en[k], k).toBeTruthy();
    }
  });
});
