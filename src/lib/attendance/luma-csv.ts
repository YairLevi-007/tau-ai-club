// Luma's guest export (Luma → event → Guests → Export CSV), read in the admin's browser.
// Pure, no dependencies. Only what attendance needs leaves this module: email, whether the
// guest was going, and whether/when they were checked in. Names, phones and answers stay in
// the browser.
//
// Luma's column names aren't documented and have changed before, so headers are matched
// loosely (case, spaces and punctuation ignored) against a few known spellings.

/** What the server gets per guest. */
export type AttendanceRow = { email: string; going: boolean; checked_in: boolean; checked_in_at: string | null };

export type LumaCsv = {
  rows: AttendanceRow[];
  /** The header each field was read from, as written in the file ("" = not found). */
  columns: { email: string; name: string; status: string; checkin: string };
  /** Each registration status seen, with how many guests had it (for the preview). */
  statuses: Record<string, number>;
  /** Number of guest rows in the file (not counting blank lines). */
  total: number;
  error: null | "empty" | "no_email";
};

// Known spellings, normalised (see key()). First match wins.
export const LUMA_COLUMNS = {
  email: ["email", "email_address", "guest_email", "e_mail"],
  name: ["name", "full_name", "guest_name"],
  status: ["approval_status", "registration_status", "status", "rsvp_status", "ticket_status"],
  checkin: ["checked_in_at", "check_in_time", "checked_in_time", "checkin_time", "check_in_at", "checked_in", "check_in", "checkin"],
} as const;

/** Statuses that mean "has a place": anything else (declined, waitlist, pending…) isn't going. */
const GOING = new Set(["approved", "going", "registered", "confirmed", "accepted", "attending", "checked_in", "invited_going"]);
const YES = new Set(["true", "yes", "y", "1", "checked_in", "checked in", "✓", "✔"]);

const key = (h: string) =>
  h
    .replace(/^﻿/, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

/** RFC 4180 CSV: quoted fields, doubled quotes, CRLF/LF, and a delimiter guessed from the header. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.slice(0, src.search(/\r?\n|$/));
  const delim = [",", ";", "\t"].map((d) => [d, firstLine.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const out: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field === "") quoted = true;
    else if (c === delim) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      out.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    out.push(row);
  }
  return out.filter((r) => r.some((f) => f.trim() !== ""));
}

/**
 * A check-in cell as an ISO time, or null. Luma writes UTC times ("2026-11-11T16:05:00.000Z"
 * or "2026-11-11 16:05:00"); a time without a zone is read as UTC.
 */
export function parseCheckinTime(v: string): string | null {
  const s = v.trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)\s*(Z|[+-]\d{2}:?\d{2}|UTC)?$/i);
  if (!m) return null;
  const zone = !m[3] || /^utc$/i.test(m[3]) ? "Z" : m[3];
  const d = new Date(`${m[1]}T${m[2]}${zone}`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function readLumaCsv(text: string): LumaCsv {
  const table = parseCsv(text);
  const empty: LumaCsv = { rows: [], columns: { email: "", name: "", status: "", checkin: "" }, statuses: {}, total: 0, error: "empty" };
  if (table.length < 2) return empty;
  const headers = table[0];
  const keys = headers.map(key);
  const find = (names: readonly string[]) => {
    for (const n of names) {
      const i = keys.indexOf(n);
      if (i >= 0) return i;
    }
    return -1;
  };
  const col = { email: find(LUMA_COLUMNS.email), name: find(LUMA_COLUMNS.name), status: find(LUMA_COLUMNS.status), checkin: find(LUMA_COLUMNS.checkin) };
  const columns = {
    email: col.email >= 0 ? headers[col.email].replace(/^﻿/, "").trim() : "",
    name: col.name >= 0 ? headers[col.name].trim() : "",
    status: col.status >= 0 ? headers[col.status].trim() : "",
    checkin: col.checkin >= 0 ? headers[col.checkin].trim() : "",
  };
  const body = table.slice(1);
  if (col.email < 0) return { ...empty, columns, total: body.length, error: "no_email" };

  const statuses: Record<string, number> = {};
  const rows: AttendanceRow[] = body.map((r) => {
    const status = col.status >= 0 ? (r[col.status] ?? "").trim().toLowerCase() : "";
    if (col.status >= 0) statuses[status || "—"] = (statuses[status || "—"] ?? 0) + 1;
    const cell = col.checkin >= 0 ? (r[col.checkin] ?? "").trim() : "";
    const at = cell ? parseCheckinTime(cell) : null;
    const checked_in = !!at || (cell !== "" && YES.has(cell.toLowerCase()));
    return {
      email: (r[col.email] ?? "").trim().toLowerCase(),
      // No status column: everyone on the list registered.
      going: col.status < 0 || GOING.has(status.replace(/\s+/g, "_")),
      checked_in,
      checked_in_at: at,
    };
  });
  return { rows: rows.filter((r) => r.email), columns, statuses, total: body.length, error: null };
}

/** Quote a value for CSV (and defuse spreadsheet formulas). */
export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
