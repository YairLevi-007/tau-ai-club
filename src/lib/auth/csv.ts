export type MemberCsvRow = { email: string; full_name: string; role: string };

/** RFC 4180-ish: commas, "quoted, fields", "" escapes, CRLF or LF. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field === "") quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

/**
 * Parses `email, full_name, role` (header row optional; columns can be in any order
 * when there is a header). The database validates each row again.
 */
export function parseMemberCsv(input: string): MemberCsvRow[] {
  const rows = parseCsv(input.replace(/^﻿/, ""));
  if (!rows.length) return [];
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const hasHeader = head.includes("email");
  const idx = hasHeader
    ? { email: head.indexOf("email"), full_name: head.indexOf("full_name"), role: head.indexOf("role") }
    : { email: 0, full_name: 1, role: 2 };
  const at = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
  return (hasHeader ? rows.slice(1) : rows).map((r) => ({
    email: at(r, idx.email),
    full_name: at(r, idx.full_name),
    role: at(r, idx.role) || "member",
  }));
}
