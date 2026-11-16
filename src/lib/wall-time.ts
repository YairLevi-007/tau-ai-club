import { TIME_ZONE } from "@/i18n/routing";

// Conversions between UTC instants and Israel wall-clock time ("YYYY-MM-DDTHH:mm",
// the value of an <input type="datetime-local">). Admin forms are always in Israel
// time, whatever the admin's own timezone, and the database stores UTC.

const parts = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function wallFields(date: Date) {
  const get = (type: string) => Number(parts.formatToParts(date).find((p) => p.type === type)?.value);
  return { y: get("year"), m: get("month"), d: get("day"), h: get("hour"), min: get("minute"), s: get("second") };
}

/** Israel's UTC offset (ms) at a given instant: +2h in winter, +3h in summer. */
function offsetMs(date: Date) {
  const f = wallFields(date);
  return Date.UTC(f.y, f.m - 1, f.d, f.h, f.min, f.s) - Math.floor(date.getTime() / 1000) * 1000;
}

/** "2027-03-03T18:00" (Israel time) → "2027-03-03T16:00:00.000Z". Null if malformed. */
export function wallTimeToUtc(value: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const naive = Date.UTC(y, mo - 1, d, h, mi);
  // Two passes settle the offset next to a DST switch.
  let t = naive - offsetMs(new Date(naive));
  t = naive - offsetMs(new Date(t));
  const out = new Date(t);
  return Number.isNaN(out.getTime()) ? null : out.toISOString();
}

/** UTC ISO → "YYYY-MM-DDTHH:mm" in Israel time, for a datetime-local input. */
export function utcToWallTime(iso: string): string {
  const f = wallFields(new Date(iso));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${f.y}-${p(f.m)}-${p(f.d)}T${p(f.h)}:${p(f.min)}`;
}
