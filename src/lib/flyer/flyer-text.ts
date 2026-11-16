// Turn the text read off a flyer (OCR in the admin's browser) into an event draft.
// Rule-based: dates, times and Luma links by pattern; venue and speakers only when they match
// a name already in the database. Titles and anything else unsure go into `hints` (suggestions
// the admin can pick), never straight into the form. Pure module.

import { emptyDraft, guessKind, hasHebrew, type DraftField, type ImportDraft } from "./draft";
import { normalizeLumaUrl } from "./luma";
import { findSpeakersInText, matchVenue, normalizeName } from "./match";

/** One line of OCR output. `height` is in pixels of the image that was read; `confidence` 0–100. */
export type OcrLine = { text: string; height: number; confidence: number };

type Named = { id: string; name_he: string; name_en: string };

const HE_MONTHS: [RegExp, number][] = [
  [/ינואר/, 1], [/פברואר/, 2], [/מרץ|מרס/, 3], [/אפריל/, 4], [/מאי/, 5], [/יוני/, 6],
  [/יולי/, 7], [/אוגוסט/, 8], [/ספטמבר/, 9], [/אוקטובר/, 10], [/נובמבר/, 11], [/דצמבר/, 12],
];
const EN_MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const HE_MONTH_RE = "ינואר|פברואר|מרץ|מרס|אפריל|מאי|יוני|יולי|אוגוסט|ספטמבר|אוקטובר|נובמבר|דצמבר";
const EN_MONTH_RE = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";

const pad = (n: number) => String(n).padStart(2, "0");

function validDate(y: number, m: number, d: number) {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/** A day/month without a year is the next such date from `today` (a month of grace for past dates). */
function withYear(m: number, d: number, y: number | null, today: Date) {
  if (y !== null) return y < 100 ? 2000 + y : y;
  const year = today.getUTCFullYear();
  const candidate = Date.UTC(year, m - 1, d);
  return candidate < today.getTime() - 31 * 86400_000 ? year + 1 : year;
}

/** A date on the flyer. `dates` holds its possible readings, most likely first. */
type Found = { dates: string[]; index: number; length: number };

/** Every date on the flyer, in reading order: 11.11 · 18/11/26 · 13 בינואר · Jan 13, 2027. */
export function findDates(text: string, today: Date): Found[] {
  const out: Found[] = [];
  const push = (y: number | null, readings: [number, number][], index: number, length: number) => {
    const dates = readings
      .filter(([m, d]) => m >= 1 && m <= 12 && validDate(withYear(m, d, y, today), m, d))
      .map(([m, d]) => `${withYear(m, d, y, today)}-${pad(m)}-${pad(d)}`);
    if (dates.length) out.push({ dates: [...new Set(dates)], index, length });
  };
  for (const m of text.matchAll(/(?<![\d:.])(\d{1,2})[./-](\d{1,2})(?:[./-](\d{4}|\d{2}))?(?![\d:])/g)) {
    // "18.00" / "19.30" look like times, not dates: no month is 00 or 30.
    const [day, month] = [Number(m[1]), Number(m[2])];
    // Inside a Hebrew line, OCR sometimes swaps the two number groups ("13.01" comes out "01.13"),
    // so without a year the other order is a second possible reading.
    const line = text.slice(text.lastIndexOf("\n", m.index!) + 1, text.indexOf("\n", m.index!) >>> 0);
    const swapped: [number, number][] = !m[3] && hasHebrew(line) ? [[day, month]] : [];
    push(m[3] ? Number(m[3]) : null, [[month, day], ...swapped], m.index!, m[0].length);
  }
  // String.raw keeps the backslashes in these patterns (a plain template string would drop them).
  for (const m of text.matchAll(new RegExp(String.raw`(?<!\d)(\d{1,2})\s*(?:ב|ל|-)?\s*(${HE_MONTH_RE})(?:\s*,?\s*(\d{4}))?`, "g"))) {
    const month = HE_MONTHS.find(([re]) => re.test(m[2]))![1];
    push(m[3] ? Number(m[3]) : null, [[month, Number(m[1])]], m.index!, m[0].length);
  }
  for (const m of text.matchAll(new RegExp(String.raw`(?<!\d)(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(${EN_MONTH_RE})\.?(?:,?\s*(\d{4}))?`, "gi"))) {
    push(m[3] ? Number(m[3]) : null, [[EN_MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1, Number(m[1])]], m.index!, m[0].length);
  }
  for (const m of text.matchAll(new RegExp(String.raw`(?<![a-z])(${EN_MONTH_RE})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?!\d)(?:,?\s*(\d{4}))?`, "gi"))) {
    push(m[3] ? Number(m[3]) : null, [[EN_MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1, Number(m[2])]], m.index!, m[0].length);
  }
  return out.sort((a, b) => a.index - b.index);
}

const HE_DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
const EN_DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/** The weekday printed on the flyer (0 = Sunday), or null. "יום רביעי", "Wed", "Wednesday". */
export function findWeekday(text: string): number | null {
  const he = text.match(/יום\s*(ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)|(?:^|\s)(שבת)(?:\s|$)/);
  if (he) return HE_DAYS.indexOf(he[1] ?? he[2]);
  const en = text.match(/\b(sun|mon|tue|wed|thu|fri|sat)(?:day|sday|nesday|rsday|urday)?\b/i);
  return en ? EN_DAYS.indexOf(en[1].toLowerCase()) : null;
}

const weekdayOf = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();

/** Times on the flyer (dates removed first so "17.11" isn't read as 17:11). Start, and end only from a range. */
export function findTimes(text: string, dates: Found[]) {
  let t = text;
  for (const d of [...dates].sort((a, b) => b.index - a.index)) t = t.slice(0, d.index) + " ".repeat(d.length) + t.slice(d.index + d.length);
  const time = (h: string, m: string, sep: string) => {
    const hh = Number(h);
    // A dot is only a time separator for round quarters (18.00, 19.30); events run 08:00–23:59.
    if (sep === "." && !["00", "15", "30", "45"].includes(m)) return "";
    return hh >= 8 && hh <= 23 && Number(m) < 60 ? `${pad(hh)}:${m}` : "";
  };
  const range = t.match(/(?<!\d)(\d{1,2})([:.])(\d{2})\s*(?:[-–—~]|עד|to|until)\s*(\d{1,2})([:.])(\d{2})(?!\d)/i);
  if (range) {
    const a = time(range[1], range[3], range[2]);
    const b = time(range[4], range[6], range[5]);
    // Hebrew lines can come out of OCR as "20:00-18:00"; the earlier one is the start.
    if (a && b && a !== b) return a < b ? { start: a, end: b } : { start: b, end: a };
  }
  for (const m of t.matchAll(/(?<![\d:.])(\d{1,2})([:.])(\d{2})(?![\d:])/g)) {
    const s = time(m[1], m[3], m[2]);
    if (s) return { start: s, end: "" };
  }
  return { start: "", end: "" };
}

const LUMA_RE = /(?:https?:\/\/)?(?:www\.)?(?:lu\.ma|luma\.com)\s?\/\s?[A-Za-z0-9_-]{3,}/i;
const VENUE_WORDS = /בניין|בנין|אולם|חדר|קומה|אודיטוריום|קמפוס|building|hall|room|auditorium|floor|campus|offices|משרדי/i;
const BOILERPLATE = /tau\s*ai|מועדון|ai club|club|cohort|מחזור|הרשמה|register|rsvp|luma|lu\.ma/i;
const MIN_TITLE_CONF = 70;

/** OCR lines → draft. Confident fields go in `filled`; unsure ones become hints. */
export function parseFlyerText(lines: OcrLine[], speakers: Named[], venues: Named[], today = new Date()): ImportDraft & { text: string } {
  const d = emptyDraft("flyer");
  const filled = new Set<DraftField>();
  const clean = lines
    .map((l) => ({
      ...l,
      text: l.text
        .replace(/\p{Bidi_Control}/gu, "") // bidi marks Tesseract adds around mixed runs
        .replace(/\bAl\b/g, "AI") // the most common Latin misread on our flyers
        .replace(/\s+/g, " ")
        .trim(),
    }))
    .filter((l) => l.text);
  const text = clean.map((l) => l.text).join("\n");

  const luma = text.match(LUMA_RE);
  const lumaUrl = luma ? normalizeLumaUrl(luma[0].replace(/\s/g, "")) : null;
  if (lumaUrl) {
    d.luma_url = lumaUrl;
    filled.add("luma_url");
  }

  // The date: the first one on the flyer. When the flyer also prints a weekday, the reading must
  // fall on it (this catches swapped digits); with no weekday, an ambiguous reading is only a hint.
  const dates = findDates(text, today);
  const weekday = findWeekday(text);
  const readings = [...new Set(dates.flatMap((x) => x.dates))];
  const first = dates[0];
  if (weekday !== null) {
    const match = dates.flatMap((x) => x.dates).find((iso) => weekdayOf(iso) === weekday);
    if (match) {
      d.date = match;
      filled.add("date");
    } else for (const r of readings.slice(0, 3)) d.hints.push({ what: "date", text: r });
  } else if (first && first.dates.length === 1) {
    d.date = first.dates[0];
    filled.add("date");
    for (const r of readings.filter((r) => r !== d.date).slice(0, 2)) d.hints.push({ what: "date", text: r });
  } else for (const r of readings.slice(0, 3)) d.hints.push({ what: "date", text: r });
  const times = findTimes(text, dates);
  if (times.start) {
    d.start_time = times.start;
    filled.add("start_time");
  }
  if (times.end) {
    d.end_time = times.end;
    filled.add("end_time");
  }

  const venue = matchVenue(text, venues);
  if (venue) {
    d.venue_id = venue.id;
    filled.add("venue");
  } else {
    const line = clean.find((l) => VENUE_WORDS.test(l.text) && !LUMA_RE.test(l.text));
    if (line) d.hints.push({ what: "venue", text: line.text });
  }

  const found = findSpeakersInText(text, speakers);
  d.speakers = found.map((s) => ({ id: s.id, name_he: s.name_he, name_en: s.name_en }));
  if (found.length) filled.add("speakers");

  // Title: the biggest lines that aren't dates, times, links, venue, speaker names or the club's own name.
  const speakerNames = found.flatMap((s) => [s.name_he, s.name_en]).map(normalizeName).filter(Boolean);
  const candidates = clean.filter((l) => {
    const n = normalizeName(l.text);
    const letters = (l.text.match(/\p{L}/gu) ?? []).length;
    if (letters < 4 || letters / l.text.replace(/\s/g, "").length < 0.6) return false;
    if (BOILERPLATE.test(l.text) || LUMA_RE.test(l.text) || VENUE_WORDS.test(l.text)) return false;
    if (findDates(l.text, today).length || /\d{1,2}[:.]\d{2}/.test(l.text)) return false;
    if (speakerNames.some((s) => n === s)) return false;
    return true;
  });
  // OCR confidence is not reliable for Hebrew display fonts (a garbled title can score 96%), so
  // titles are never filled in: the biggest clean lines are offered as suggestions to pick from.
  const sure = candidates.filter((l) => l.confidence >= MIN_TITLE_CONF);
  const maxH = Math.max(0, ...sure.map((l) => l.height));
  for (const l of sure.filter((x) => x.height >= maxH * 0.45).sort((a, b) => b.height - a.height).slice(0, 4)) {
    d.hints.push({ what: "title", text: l.text.slice(0, 200) });
  }

  d.kind = guessKind(text);
  if (d.kind) filled.add("kind");
  d.filled = [...filled];
  return { ...d, text };
}
