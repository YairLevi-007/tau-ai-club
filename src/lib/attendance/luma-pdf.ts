// Luma's attendee PDF (the "AI Club Cohort B - Session #N" export the club's automation sends),
// read in the admin's browser like the CSV (luma-csv.ts). Pure: it takes the PDF's text, line by
// line, and returns the same shape as readLumaCsv, so the preview and the save are the same.
// Only email + going + checked in leave this module; names, dates and the "other sessions"
// column are dropped here.
//
// Each guest is one line of the table: #, name, email, status (Checked In / Going / Not Going),
// registration date, and other sessions ("S2: Going; S3: Going" or "-"). Columns can come out in
// any order (the PDF is laid out right to left), so a line is read by content, not position:
// the email is the one email address on it; the status is the one status left once the
// "S<n>: <status>" cells of the other-sessions column are removed.

import type { AttendanceRow, LumaCsv } from "./luma-csv";

export type LumaPdf = Omit<LumaCsv, "error"> & {
  /** The PDF's title line ("AI Club Cohort B - Session #1 (Nov 11)"), for the admin to check. */
  title: string;
  /** Guest lines that had an email but no single readable status (not imported). */
  unreadable: number;
  error: null | "empty" | "not_luma";
};

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const STATUS = /\b(Checked In|Not Going|Going)\b/gi;
const OTHER_SESSION = /\bS\d+\s*:\s*(?:Checked In|Not Going|Going)\b/gi;
const TITLE = /AI Club\b.*\bSession\s*#\s*\d+/i;

export function readLumaPdfLines(lines: string[]): LumaPdf {
  // NFKC first: pdf.js hands over ligatures as single characters ("ﬁ" in "inﬁnity73737@gmail.com").
  const clean = lines.map((l) => l.normalize("NFKC").replace(/\s+/g, " ").trim()).filter(Boolean);
  const title = clean.find((l) => TITLE.test(l)) ?? "";
  const base: LumaPdf = {
    rows: [],
    columns: { email: "", name: "", status: "", checkin: "" },
    statuses: {},
    total: 0,
    labels: {},
    title,
    unreadable: 0,
    error: null,
  };
  if (!clean.length) return { ...base, error: "empty" };
  if (!title) return { ...base, error: "not_luma" };

  const rows: AttendanceRow[] = [];
  const statuses: Record<string, number> = {};
  const labels: Record<string, string> = {};
  let unreadable = 0;
  let total = 0;
  for (const line of clean) {
    const emails = line.match(EMAIL) ?? [];
    if (emails.length !== 1) continue; // headers, summary lines, page footers
    total++;
    const found = line.replace(OTHER_SESSION, " ").replace(EMAIL, " ").match(STATUS) ?? [];
    if (found.length !== 1) {
      unreadable++;
      continue;
    }
    const status = found[0].toLowerCase();
    statuses[status] = (statuses[status] ?? 0) + 1;
    const label = pdfLabel(line);
    if (label) labels[emails[0].toLowerCase()] = label;
    rows.push({
      email: emails[0].toLowerCase(),
      going: status !== "not going",
      checked_in: status === "checked in",
      // The PDF has no check-in time.
      checked_in_at: null,
    });
  }
  if (!total) return { ...base, error: "not_luma" };
  return {
    ...base,
    rows,
    statuses,
    total,
    labels,
    unreadable,
    columns: { email: "Email", name: "", status: "Status", checkin: "Status (Checked In)" },
  };
}

/**
 * The guest's name on a table line, for the admin's unmatched list (browser only): the line
 * without its row number, email, statuses, dates and the other-sessions cells.
 */
export function pdfLabel(line: string): string {
  return line
    .replace(OTHER_SESSION, " ")
    .replace(EMAIL, " ")
    .replace(STATUS, " ")
    .replace(/\b\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?\b|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.? \d{1,2}(?:, \d{4})?\b|\b\d{1,2}:\d{2}\s*(?:AM|PM)?\b/gi, " ")
    .replace(/(^|\s)#?\d+(?=\s|$)/g, " ")
    .replace(/(^|\s)[-;,|]+(?=\s|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** A piece of text on a PDF page, where pdf.js put it (x grows rightwards, y grows upwards). */
export type PdfTextItem = { str: string; x: number; y: number };

/**
 * Page text items → lines, top to bottom: items whose baselines are within 3pt are one line,
 * joined left to right with spaces ("Checked" + "In" → "Checked In", "S2:" + "Going" → "S2: Going").
 */
export function textItemsToLines(pages: PdfTextItem[][]): string[] {
  const out: string[] = [];
  for (const items of pages) {
    const rows: { y: number; items: PdfTextItem[] }[] = [];
    for (const it of items) {
      if (!it.str.trim()) continue;
      let row = rows.find((r) => Math.abs(r.y - it.y) < 3);
      if (!row) rows.push((row = { y: it.y, items: [] }));
      row.items.push(it);
    }
    rows.sort((a, b) => b.y - a.y);
    for (const r of rows) out.push(r.items.sort((a, b) => a.x - b.x).map((i) => i.str.trim()).join(" "));
  }
  return out;
}
