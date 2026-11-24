import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { readLumaPdfLines, textItemsToLines, type PdfTextItem } from "../../src/lib/attendance/luma-pdf";

// Luma's attendee PDF as an attendance import (24.11), next to the CSV. Fictional people only:
// the PDF below is built here, in the layout of the real export (title line, summary, a table of
// #, name, email, status, registration date and other sessions, laid out right to left).

const ROOT = resolve(__dirname, "../..");

type Cell = [x: number, text: string];
/** A one-page PDF with Helvetica text at the given positions (one text object per cell). */
function makePdf(lines: { y: number; cells: Cell[] }[]): Uint8Array {
  const esc = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`);
  const stream = lines.flatMap(({ y, cells }) => cells.map(([x, s]) => `BT /F1 9 Tf ${x} ${y} Td (${esc(s)}) Tj ET`)).join("\n");
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`,
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out, "latin1"));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(out, "latin1"));
}

// Right to left, like the export: other sessions, registered, status, email, name, #.
const row = (y: number, n: number, name: string, email: string, status: string[], others: string[]) => ({
  y,
  cells: [...others.map((s, i) => [40 + i * 28, s] as Cell), [200, "Nov 2, 2026"], ...status.map((s, i) => [290 + i * 40, s] as Cell), [380, email], [600, name], [780, String(n)]] as Cell[],
});
const FAKE = [
  { y: 560, cells: [[300, "AI Club Cohort B - Session #1 (Nov 11)"]] as Cell[] },
  { y: 540, cells: [[500, "Summary: 3 checked in, 2 going, 1 not going"]] as Cell[] },
  { y: 515, cells: [[40, "Other sessions"], [200, "Registered"], [290, "Status"], [380, "Email"], [600, "Name"], [780, "#"]] as Cell[] },
  row(495, 1, "Dana Demo", "dana@example.test", ["Checked", "In"], ["S2:", "Going;", "S3:", "Going"]),
  row(480, 2, "Noa Demo", "Noa@Example.test", ["Checked In"], ["-"]),
  row(465, 3, "Yuval Demo", "yuval@example.test", ["Going"], ["S2:", "Checked In"]),
  row(450, 4, "Maya Demo", "maya@example.test", ["Not Going"], ["-"]),
  row(435, 5, "Omer Demo", "omer@example.test", ["Going"], ["S2: Not Going"]),
  row(420, 6, "Tamar Demo", "tamar@example.test", ["Checked In"], ["-"]),
];

async function pdfLines(bytes: Uint8Array) {
  const pdfjs = await import(pathToFileURL(resolve(ROOT, "node_modules/pdfjs-dist/legacy/build/pdf.mjs")).href);
  const task = pdfjs.getDocument({ data: bytes, enableXfa: false, disableFontFace: true, useSystemFonts: false, stopAtErrors: true, verbosity: 0 });
  const doc = await task.promise;
  const pages: PdfTextItem[][] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const c = await (await doc.getPage(p)).getTextContent();
    pages.push(c.items.flatMap((it: { str?: string; transform: number[] }) => (it.str ? [{ str: it.str, x: it.transform[4], y: it.transform[5] }] : [])));
  }
  await task.destroy();
  return textItemsToLines(pages);
}

test.describe("Luma attendee PDF", () => {
  test.skip(({ isMobile }) => isMobile, "pure check: desktop project only");

  test("a real (fake-data) PDF read with pdf.js gives the same rows as the CSV path", async () => {
    const res = readLumaPdfLines(await pdfLines(makePdf(FAKE)));
    expect(res.error).toBeNull();
    expect(res.title).toBe("AI Club Cohort B - Session #1 (Nov 11)");
    expect(res.total).toBe(6);
    expect(res.unreadable).toBe(0);
    expect(res.statuses).toEqual({ "checked in": 3, going: 2, "not going": 1 });
    expect(res.rows).toEqual([
      { email: "dana@example.test", going: true, checked_in: true, checked_in_at: null },
      { email: "noa@example.test", going: true, checked_in: true, checked_in_at: null },
      { email: "yuval@example.test", going: true, checked_in: false, checked_in_at: null },
      { email: "maya@example.test", going: false, checked_in: false, checked_in_at: null },
      { email: "omer@example.test", going: true, checked_in: false, checked_in_at: null },
      { email: "tamar@example.test", going: true, checked_in: true, checked_in_at: null },
    ]);
  });

  test("only email, going and checked in come out: no names, dates or other sessions", async () => {
    const res = readLumaPdfLines(await pdfLines(makePdf(FAKE)));
    const out = JSON.stringify(res.rows);
    for (const leak of ["Demo", "Nov 2", "S2", "S3"]) expect(out).not.toContain(leak);
    for (const r of res.rows) expect(Object.keys(r).sort()).toEqual(["checked_in", "checked_in_at", "email", "going"]);
  });

  test("a PDF that isn't Luma's attendee report is refused", async () => {
    const other = makePdf([{ y: 560, cells: [[40, "Invoice #12"]] }, { y: 540, cells: [[40, "billing@example.test"], [300, "Going"]] }]);
    expect(readLumaPdfLines(await pdfLines(other)).error).toBe("not_luma");
    expect(readLumaPdfLines(await pdfLines(makePdf([{ y: 560, cells: [[300, "AI Club Cohort B - Session #2 (Nov 18)"]] }]))).error).toBe("not_luma");
    expect(readLumaPdfLines([]).error).toBe("empty");
  });

  test("a row with no status, or two, is counted as unreadable and not imported", () => {
    const res = readLumaPdfLines([
      "AI Club Cohort B - Session #3 (Dec 16)",
      "S2: Going Nov 2, 2026 a@example.test A 1",
      "Nov 2, 2026 Going Checked In b@example.test B 2",
      "- Nov 2, 2026 Going c@example.test C 3",
    ]);
    expect(res.total).toBe(3);
    expect(res.unreadable).toBe(2);
    expect(res.rows.map((r) => r.email)).toEqual(["c@example.test"]);
  });

  test("text items group into lines by baseline, read left to right, top to bottom", () => {
    expect(
      textItemsToLines([
        [
          { str: "In", x: 330, y: 100.4 },
          { str: "b@example.test", x: 380, y: 80 },
          { str: "Checked", x: 290, y: 99.2 },
          { str: "Title", x: 10, y: 200 },
          { str: " ", x: 5, y: 100 },
        ],
      ]),
    ).toEqual(["Title", "Checked In", "b@example.test"]);
  });

  test("the import accepts PDFs next to CSVs, and reads them in the browser only", () => {
    const ui = readFileSync(resolve(ROOT, "src/components/admin/attendance/attendance-import.tsx"), "utf8");
    expect(ui).toMatch(/accept="\.csv,text\/csv,\.pdf,application\/pdf"/);
    expect(ui).toMatch(/readLumaCsv\(await file\.text\(\)\)/); // the CSV path is unchanged
    expect(ui).toMatch(/importAttendance\(eventId, rows, commit\)/); // same server call for both
    const reader = readFileSync(resolve(ROOT, "src/lib/attendance/pdf-text.ts"), "utf8");
    expect(reader).not.toMatch(/fetch\(|XMLHttpRequest|url:/);
    expect(reader).toMatch(/enableXfa: false/);
  });
});
