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

