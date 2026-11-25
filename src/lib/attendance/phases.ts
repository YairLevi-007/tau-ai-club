// The session's two Luma uploads (DECISIONS 25.11), as pure functions: shared by the admin
// pages and the tests. Mirrors the database rule (migration 20261125000000): an upload saved
// once the session has ended is the "after" one; before that, the "before" one.

type Ends = { ends_at: string };
type Times = { imported_at: string; before_imported_at?: string | null; after_imported_at?: string | null };

export type UploadPhase = "before" | "after";

/** Which upload a session is waiting for now: "before" until it ends, then "after". */
export const uploadPhase = (event: Ends, now: string): UploadPhase => (Date.parse(event.ends_at) <= Date.parse(now) ? "after" : "before");

/** When each of the two uploads was done. Falls back to the single import time if the columns aren't there yet. */
export function uploadTimes(info: Times | null, event: Ends): { before: string | null; after: string | null } {
  if (!info) return { before: null, after: null };
  if ("before_imported_at" in info || "after_imported_at" in info) return { before: info.before_imported_at ?? null, after: info.after_imported_at ?? null };
  const after = Date.parse(info.imported_at) >= Date.parse(event.ends_at);
  return { before: after ? null : info.imported_at, after: after ? info.imported_at : null };
}


/** What each upload brought in (migration 20261125120000): counts only, stamped per phase. */
export type BeforeCounts = { rows: number; members: number; guests: number };
export type AfterCounts = { rows: number; membersIn: number; guestsIn: number; noShows: number };
type Counts = {
  before_rows_total?: number | null;
  before_members?: number | null;
  before_guests?: number | null;
  after_rows_total?: number | null;
  after_members_checked_in?: number | null;
  after_no_shows?: number | null;
  after_guests_checked_in?: number | null;
};

/** Each upload's counts, or null when it wasn't done (or was done before the counts were kept). */
export function uploadCounts(info: Counts | null): { before: BeforeCounts | null; after: AfterCounts | null } {
  const n = (v: number | null | undefined) => (typeof v === "number" ? v : 0);
  return {
    before:
      typeof info?.before_rows_total === "number"
        ? { rows: info.before_rows_total, members: n(info.before_members), guests: n(info.before_guests) }
        : null,
    after:
      typeof info?.after_rows_total === "number"
        ? { rows: info.after_rows_total, membersIn: n(info.after_members_checked_in), guestsIn: n(info.after_guests_checked_in), noShows: n(info.after_no_shows) }
        : null,
  };
}
