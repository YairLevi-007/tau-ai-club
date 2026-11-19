import type { Locale } from "@/i18n/routing";
import { TIME_ZONE } from "@/i18n/routing";
import type { ClubEvent } from "@/lib/data/types";

/** Pick the `${field}_he` / `${field}_en` column for a locale, falling back to the other language. */
export function loc<T extends Record<string, unknown>>(row: T, field: string, locale: Locale): string | null {
  const primary = row[`${field}_${locale}`];
  const fallback = row[`${field}_${locale === "he" ? "en" : "he"}`];
  const value = primary ?? fallback;
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

const intlLocale: Record<Locale, string> = { he: "he-IL", en: "en-GB" };

/** e.g. he: "יום רביעי, 18 בנובמבר" · en: "Wednesday, 18 November" (Israel time). */
export function formatEventDate(iso: string, locale: Locale) {
  return new Intl.DateTimeFormat(intlLocale[locale], {
    timeZone: TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(iso));
}

/** Short date for the timeline, e.g. "18.11". */
export function formatShortDate(iso: string, locale: Locale) {
  return new Intl.DateTimeFormat(intlLocale[locale], {
    timeZone: TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
  })
    .format(new Date(iso))
    .replace("/", ".");
}

/** "18:00–20:00" in Israel time (24h in both languages). */
export function formatTimeRange(startIso: string, endIso: string) {
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  return `${f.format(new Date(startIso))}–${f.format(new Date(endIso))}`;
}

/** Machine-readable ISO for <time dateTime>. */
export const isoAttr = (iso: string) => new Date(iso).toISOString();

export function speakerNames(event: ClubEvent, locale: Locale): string[] {
  return event.event_speakers.map((es) => loc(es.speaker, "name", locale)).filter((n): n is string => !!n);
}

/** Venue label: the venue name, else the venue note, else null (caller shows "Venue TBD"). */
export function venueLabel(event: ClubEvent, locale: Locale): string | null {
  const name = event.venue ? loc(event.venue, "name", locale) : null;
  const note = loc(event, "venue_note", locale);
  if (name && note) return `${name} · ${note}`;
  return name ?? note;
}

/** True when the venue isn't pinned down yet (no venue row). */
export const venueIsTbd = (event: ClubEvent) => !event.venue;

function gcalStamp(iso: string) {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Google Calendar "add event" link (times in UTC, displayed in Israel time). */
export function googleCalendarUrl(
  event: ClubEvent,
  locale: Locale,
  opts: { pageUrl?: string; tbdLabel: string },
) {
  const title = loc(event, "title", locale) ?? "";
  const names = speakerNames(event, locale);
  const details = [loc(event, "blurb", locale), names.length ? names.join(", ") : null, opts.pageUrl, event.luma_url]
    .filter(Boolean)
    .join("\n\n");
  const address = event.venue ? loc(event.venue, "address", locale) : null;
  const location = [venueLabel(event, locale) ?? opts.tbdLabel, address].filter(Boolean).join(", ");

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `TAU AI Club · ${title}`,
    dates: `${gcalStamp(event.starts_at)}/${gcalStamp(event.ends_at)}`,
    ctz: TIME_ZONE,
    details,
    location,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}


const HEBREW = /[\u0590-\u05FF]/;
// A run of English: starts with a Latin letter, may hold digits, spaces and inner punctuation,
// ends on a letter or digit, then takes any punctuation that follows it (", " ": " ...).
const LATIN_RUN = /[A-Za-z](?:[A-Za-z0-9\s.,:;&+'\u2019\-\u2013\u00b7/!?#@]*[A-Za-z0-9])?[.,:;!?]*/g;

export type BidiSegment = { text: string; ltr: boolean };

/**
 * Display-only split of a mixed Hebrew/English text (design review item 1, 19.11). In a Hebrew
 * line, a comma after an English run sits between English and Hebrew, so it takes the Hebrew
 * direction and lands on the wrong side (",Claude Code"). The caller renders each `ltr` segment
 * in its own LTR isolate (<bdi dir="ltr">), so the run keeps its punctuation ("Corporate,").
 *
 * One exception: a title that opens with a single English word and punctuation ("AI, עבר
 * ועתיד…") is left to the normal Hebrew flow. Isolated, "AI," would sit at the right edge with
 * its comma as the first thing a Hebrew reader meets (",AI"); in the Hebrew flow the comma sits
 * between "AI" and the Hebrew that follows.
 *
 * `context` is the whole title when `text` is only a piece of it (the h1's "Zero to Hero 2:" before
 * the accent): the piece is shaped as part of a Hebrew title even if it has no Hebrew of its own,
 * and the opening-word exception applies only to the piece that opens the title.
 * Text whose context has no Hebrew (every English title) comes back as one plain segment, unchanged. Never use
 * this on stored values: it only shapes rendering and adds no characters (copying stays clean).
 */
export function bidiSegments(text: string, context: string = text): BidiSegment[] {
  if (!HEBREW.test(context)) return [{ text, ltr: false }];
  const out: BidiSegment[] = [];
  let last = 0;
  for (const m of text.matchAll(LATIN_RUN)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ text: text.slice(last, at), ltr: false });
    const leadingWord = at === 0 && context.startsWith(text) && !/\s/.test(m[0]) && /[.,:;!?]$/.test(m[0]);
    out.push({ text: m[0], ltr: !leadingWord });
    last = at + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), ltr: false });
  return out;
}
