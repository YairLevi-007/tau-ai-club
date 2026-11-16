import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { readFlyer, type FlyerReading, type FlyerSquare } from "../../src/components/admin/flyer/read-flyer";
import { parseFlyerText } from "../../src/lib/flyer/flyer-text";
import { captionChips, guessPerson } from "../../src/lib/flyer/people";

// Reads the sample flyers (scripts/make-sample-flyers.mjs) with the exact browser code the admin
// page uses (MediaPipe faces + Tesseract text), then checks the results against the ground truth
// in fixtures/flyers.json. Needs network access to cdn.jsdelivr.net and storage.googleapis.com,
// like the admin page does. Desktop Chromium only. Each run prints an accuracy line per flyer.
//
// We assert what we promise on clean exports (every face found, every crop on the photo, the
// name in the chips). Phone photos are reported, and only checked for "nothing wrong".

const FIX = path.join(__dirname, "fixtures");
const TRUTH = JSON.parse(readFileSync(path.join(FIX, "flyers.json"), "utf8")) as Record<string, { name: string; role: string; company: string; frame: FlyerSquare }[]>;
const SPEAKERS = [
  { id: "00000000-0000-4000-8000-0000000000a1", name_he: "שי יהל", name_en: "Shai Yahel" },
  { id: "00000000-0000-4000-8000-0000000000a3", name_he: "תמר לוי", name_en: "Tamar Levi" },
  { id: "00000000-0000-4000-8000-0000000000a4", name_he: "דניאל מור", name_en: "Daniel Mor" },
  { id: "00000000-0000-4000-8000-0000000000a6", name_he: "אורי גושן", name_en: "Ori Goshen" },
];
const VENUES = [
  { id: "00000000-0000-4000-8000-0000000000b1", name_he: "אולם ברודקום", name_en: "Broadcom Hall" },
  { id: "00000000-0000-4000-8000-0000000000b2", name_he: "המרכז ליזמות", name_en: "Entrepreneurship Center" },
];
const TODAY = new Date("2026-11-16T10:00:00Z");

test.beforeEach(({ browserName }, info) => test.skip(info.project.name !== "desktop" || browserName !== "chromium", "runs once, on desktop Chromium"));
test.setTimeout(240_000);

async function read(page: Page, file: string, opts: { page?: boolean } = {}): Promise<FlyerReading> {
  // A real https origin (IndexedDB, workers and module imports behave as on the site).
  await page.route("https://flyer.test/**", (r) => r.fulfill({ contentType: "text/html", body: "<!doctype html><title>ocr</title>" }));
  await page.goto("https://flyer.test/");
  const type = file.endsWith(".png") ? "image/png" : "image/jpeg";
  const dataUrl = `data:${type};base64,${readFileSync(path.join(FIX, file)).toString("base64")}`;
  // readFlyer is self-contained, so its source runs as-is in the page.
  return page.evaluate(`(${readFlyer.toString()})(${JSON.stringify(dataUrl)}, ${JSON.stringify(opts)})`) as Promise<FlyerReading>;
}

/** 1 - edit distance / length. */
function similarity(a: string, b: string) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return 1 - dp[a.length][b.length] / Math.max(a.length, b.length, 1);
}
const close = (a: string, b: string) => similarity(a.replace(/\s+/g, " ").trim(), b) >= 0.85;

/** The phone photo is the flyer scaled 0.9, rotated 4° and centred on 1200×1600: map a frame onto it. */
function onPhone(f: FlyerSquare): FlyerSquare {
  const a = (4 * Math.PI) / 180;
  const cx = (f.x + f.size / 2 - 540) * 0.9;
  const cy = (f.y + f.size / 2 - 675) * 0.9;
  const size = f.size * 0.9;
  return { x: 600 + cx * Math.cos(a) - cy * Math.sin(a) - size / 2, y: 800 + cx * Math.sin(a) + cy * Math.cos(a) - size / 2, size };
}
function iou(a: FlyerSquare, b: FlyerSquare) {
  const w = Math.max(0, Math.min(a.x + a.size, b.x + b.size) - Math.max(a.x, b.x));
  const h = Math.max(0, Math.min(a.y + a.size, b.y + b.size) - Math.max(a.y, b.y));
  return (w * h) / (a.size ** 2 + b.size ** 2 - w * h);
}

type Score = { faces: string; crops: number; nameChip: number; roleChip: number; companyChip: number; guessName: number; guessRole: number; guessCompany: number; linked: number };

/** Match each truth person to the detected face whose crop overlaps their photo most, and score. */
function scorePeople(name: string, r: FlyerReading, phone: boolean) {
  const truth = TRUTH[name];
  const s: Score = { faces: `${r.people.length}/${truth.length}`, crops: 0, nameChip: 0, roleChip: 0, companyChip: 0, guessName: 0, guessRole: 0, guessCompany: 0, linked: 0 };
  const details: unknown[] = [];
  for (const t of truth) {
    const frame = phone ? onPhone(t.frame) : t.frame;
    const best = r.people.map((p) => ({ p, o: iou(p.square, frame) })).sort((a, b) => b.o - a.o)[0];
    if (!best || best.o < 0.3) {
      details.push({ person: t.name, found: false });
      continue;
    }
    const p = best.p;
    const fc = { x: p.face.x + p.face.w / 2, y: p.face.y + p.face.h / 2 };
    const cropOk = best.o >= 0.5 && fc.x > frame.x && fc.x < frame.x + frame.size && fc.y > frame.y && fc.y < frame.y + frame.size;
    const chips = captionChips(p.caption);
    const g = guessPerson(p.caption, SPEAKERS);
    const known = SPEAKERS.find((k) => k.name_he === t.name || k.name_en === t.name);
    const gName = g.name_he || g.name_en;
    const gRole = g.role_he || g.role_en;
    const gCompany = g.company_he || g.company_en;
    s.crops += +cropOk;
    s.nameChip += +chips.some((c) => close(c, t.name));
    s.roleChip += +chips.some((c) => close(c, t.role));
    s.companyChip += +chips.some((c) => close(c, t.company));
    s.guessName += +(known ? g.speakerId === known.id : close(gName, t.name));
    s.guessRole += +close(gRole, t.role);
    s.guessCompany += +close(gCompany, t.company);
    s.linked += +(known ? g.speakerId === known.id : g.speakerId === null);
    details.push({ person: t.name, iou: +best.o.toFixed(2), cropOk, chips, guess: g });
  }
  console.log(`\n[people ${name}${phone ? " phone" : ""}] ${JSON.stringify(s)}\n${JSON.stringify(details, null, 1)}`);
  return s;
}

test("text: clean flyer export gives date, time, venue, speakers and Luma link", async ({ page }) => {
  const r = await read(page, "flyer-he.png", { page: true });
  const d = parseFlyerText(r.lines, SPEAKERS, VENUES, TODAY);
  console.log(`\n[text clean] ${JSON.stringify({ date: d.date, start: d.start_time, end: d.end_time, venue: d.venue_id, luma: d.luma_url, speakers: d.speakers.map((s) => s.name_en), hints: d.hints })}`);
  expect(d).toMatchObject({ date: "2027-01-13", start_time: "18:00", end_time: "20:00", venue_id: VENUES[0].id, luma_url: "https://lu.ma/tau-ai-agents", title_he: "", title_en: "" });
  expect(d.speakers.map((s) => s.id)).toEqual([SPEAKERS[3].id, SPEAKERS[0].id]);
});

test("text: phone photo fills nothing wrong", async ({ page }) => {
  const d = parseFlyerText((await read(page, "flyer-he-phone.jpg", { page: true })).lines, SPEAKERS, VENUES, TODAY);
  console.log(`\n[text phone] ${JSON.stringify({ date: d.date, start: d.start_time, end: d.end_time, venue: d.venue_id, luma: d.luma_url, speakers: d.speakers.map((s) => s.name_en) })}`);
  if (d.date) expect(d.date).toBe("2027-01-13");
  if (d.start_time) expect(d.start_time).toBe("18:00");
  if (d.end_time) expect(d.end_time).toBe("20:00");
  if (d.venue_id) expect(d.venue_id).toBe(VENUES[0].id);
  if (d.luma_url) expect(d.luma_url).toBe("https://lu.ma/tau-ai-agents");
});

for (const name of ["flyer-he-speaker", "flyer-two-speakers"]) {
  test(`people: ${name} (clean): every face cropped on its photo, name among the chips`, async ({ page }) => {
    const s = scorePeople(name, await read(page, `${name}.png`), false);
    const n = TRUTH[name].length;
    expect(s.faces).toBe(`${n}/${n}`);
    expect(s.crops).toBe(n);
    expect(s.nameChip).toBe(n);
    expect(s.linked).toBe(n);
  });

  test(`people: ${name} (phone photo): reported, nothing linked to the wrong speaker`, async ({ page }) => {
    const r = await read(page, `${name}-phone.jpg`);
    scorePeople(name, r, true);
    for (const p of r.people) {
      const g = guessPerson(p.caption, SPEAKERS);
      // A link to an existing speaker must be one who is really on this flyer.
      const k = SPEAKERS.find((x) => x.id === g.speakerId);
      if (k) expect(TRUTH[name].some((t) => t.name === k.name_he || t.name === k.name_en)).toBe(true);
    }
  });
}
