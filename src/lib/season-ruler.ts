// Pure helpers for the season dial (see components/events/season-dial.tsx).
import { TIME_ZONE } from "@/i18n/routing";

const DAY_MS = 86_400_000;

/** Calendar day number (days since epoch) of an instant, counted in Israel time. */
export function jlmDay(iso: string): number {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date(iso))
    .split("-")
    .map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;
}

/** A Date at UTC midnight for a day number, for formatting with timeZone "UTC". */
export const dayToDate = (day: number) => new Date(day * DAY_MS);

/** First day of each month that falls inside [start, end], plus the start itself. */
export function monthStarts(start: number, end: number): number[] {
  const out = [start];
  const d = dayToDate(start);
  let cursor = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) / DAY_MS;
  while (cursor <= end) {
    out.push(cursor);
    const c = dayToDate(cursor);
    cursor = Date.UTC(c.getUTCFullYear(), c.getUTCMonth() + 1, 1) / DAY_MS;
  }
  return out;
}
