import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { runFlyerOcr, type OcrResultLine } from "../../src/components/admin/flyer/ocr";
import { parseFlyerText } from "../../src/lib/flyer/flyer-text";

// Reads the sample flyers (scripts/make-sample-flyers.mjs) with the exact browser OCR code the
// admin page uses, then parses them against the seed speakers and venues. Needs network access
// to cdn.jsdelivr.net (Tesseract + language data), like the admin page does. Desktop only.
//
// What we assert is what we promise: on a clean export, the date, time, venue, speakers and
// Luma link are found; on a phone photo we only require that nothing *wrong* is filled in.

const SPEAKERS = [
  { id: "00000000-0000-4000-8000-0000000000a1", name_he: "שי יהל", name_en: "Shai Yahel" },
  { id: "00000000-0000-4000-8000-0000000000a2", name_he: "עוז", name_en: "Oz" },
  { id: "00000000-0000-4000-8000-0000000000a3", name_he: "אור מכבי", name_en: "Or Maccabi" },
  { id: "00000000-0000-4000-8000-0000000000a6", name_he: "אורי גושן", name_en: "Ori Goshen" },
];
const VENUES = [
  { id: "00000000-0000-4000-8000-0000000000b1", name_he: "אולם ברודקום", name_en: "Broadcom Hall" },
  { id: "00000000-0000-4000-8000-0000000000b2", name_he: "המרכז ליזמות", name_en: "Entrepreneurship Center" },
];
const TODAY = new Date("2026-11-16T10:00:00Z");
const TRUTH = {
  title_he: "סוכני AI בעולם האמיתי",
  title_en: "AI agents in the real world",
  date: "2027-01-13",
  start_time: "18:00",
  end_time: "20:00",
  venue_id: VENUES[0].id,
  luma_url: "https://lu.ma/tau-ai-agents",
  speakers: [SPEAKERS[3].id, SPEAKERS[0].id],
};

test.beforeEach(({ browserName }, info) => test.skip(info.project.name !== "desktop" || browserName !== "chromium", "runs once, on desktop Chromium"));
test.setTimeout(180_000);

async function ocr(page: import("@playwright/test").Page, file: string, type: string): Promise<OcrResultLine[]> {
  // A real https origin for the page (IndexedDB, workers and module imports behave as on the site).
  await page.route("https://flyer.test/**", (r) => r.fulfill({ contentType: "text/html", body: "<!doctype html><title>ocr</title>" }));
  await page.goto("https://flyer.test/");
  const dataUrl = `data:${type};base64,${readFileSync(path.join(__dirname, "fixtures", file)).toString("base64")}`;
  return page.evaluate(runFlyerOcr, dataUrl);
}

/** 1 - edit distance / length: how much of the title came through. */
function similarity(a: string, b: string) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return 1 - dp[a.length][b.length] / Math.max(a.length, b.length, 1);
}

function report(name: string, lines: OcrResultLine[]) {
  const d = parseFlyerText(lines, SPEAKERS, VENUES, TODAY);
  const fields = {
    date: d.date === TRUTH.date,
    start_time: d.start_time === TRUTH.start_time,
    end_time: d.end_time === TRUTH.end_time,
    venue: d.venue_id === TRUTH.venue_id,
    luma_url: d.luma_url === TRUTH.luma_url,
    speakers: JSON.stringify(d.speakers.map((s) => s.id)) === JSON.stringify(TRUTH.speakers),
    title_he: d.title_he === TRUTH.title_he,
    title_en: d.title_en === TRUTH.title_en,
  };
  console.log(
    `\n[ocr ${name}] ${Object.values(fields).filter(Boolean).length}/8 fields exact`,
    JSON.stringify({ fields, title_he: d.title_he, title_en: d.title_en, hints: d.hints, he_similarity: similarity(d.title_he || d.hints.find((h) => h.what === "title")?.text || "", TRUTH.title_he).toFixed(2) }),
    `\n--- text ---\n${lines.map((l) => `${l.confidence}%\th${l.height}\t${l.text}`).join("\n")}`,
  );
  return { d, fields };
}

test("clean flyer export: date, time, venue, speakers and Luma link are found", async ({ page }) => {
  const { d, fields } = report("clean", await ocr(page, "flyer-he.png", "image/png"));
  expect(fields).toMatchObject({ date: true, start_time: true, end_time: true, venue: true, luma_url: true, speakers: true });
  // A title is only filled when OCR was confident; when it is, it must be the real one.
  if (d.title_he) expect(similarity(d.title_he, TRUTH.title_he)).toBeGreaterThan(0.8);
  if (d.title_en) expect(similarity(d.title_en, TRUTH.title_en)).toBeGreaterThan(0.8);
});

test("phone photo of the flyer: whatever is filled in is right", async ({ page }) => {
  const { d } = report("phone", await ocr(page, "flyer-he-phone.jpg", "image/jpeg"));
  if (d.date) expect(d.date).toBe(TRUTH.date);
  if (d.start_time) expect(d.start_time).toBe(TRUTH.start_time);
  if (d.end_time) expect(d.end_time).toBe(TRUTH.end_time);
  if (d.venue_id) expect(d.venue_id).toBe(TRUTH.venue_id);
  if (d.luma_url) expect(d.luma_url).toBe(TRUTH.luma_url);
  for (const s of d.speakers) expect(TRUTH.speakers).toContain(s.id);
});
