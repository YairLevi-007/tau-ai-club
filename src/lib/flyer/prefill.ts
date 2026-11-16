// The draft an admin carries from the import panel (Luma link or flyer) to the event form, as a URL param
// (`/admin/events/new?prefill=…`). Pure module; validated again on the server.

export type EventPrefill = {
  title_he: string;
  title_en: string;
  slug: string;
  kind: string;
  series: string;
  series_no: number | null;
  blurb_he: string;
  blurb_en: string;
  starts_at: string; // Israel wall time "YYYY-MM-DDTHH:mm" or ""
  ends_at: string;
  venue_id: string;
  venue_note_he: string;
  venue_note_en: string;
  luma_url: string;
  speaker_ids: string[];
  notes: string;
  /** Form field names the import filled, highlighted on the form for review. */
  filled: string[];
};

/** Form fields that can be marked as imported. */
export const PREFILL_FIELDS = [
  "title_he", "title_en", "kind", "blurb_he", "blurb_en", "starts_at", "ends_at",
  "venue_id", "venue_note_he", "venue_note_en", "speaker_id", "luma_url",
] as const;

const DEFAULT_START = "18:00";
const DEFAULT_END = "20:00";

/** Date + times from the flyer → datetime-local values, defaulting to 18:00–20:00. */
export function wallTimes(date: string, start: string, end: string) {
  if (!date) return { starts_at: "", ends_at: "" };
  const s = start || DEFAULT_START;
  let e = end || (start ? addHours(s, 2) : DEFAULT_END);
  if (e <= s) e = addHours(s, 2);
  return { starts_at: `${date}T${s}`, ends_at: `${date}T${e}` };
}

function addHours(hhmm: string, h: number) {
  const [hh, mm] = hhmm.split(":").map(Number);
  const total = Math.min(23 * 60 + 59, hh * 60 + mm + h * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

const toB64Url = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const fromB64Url = (s: string) => {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};

export const encodePrefill = (p: EventPrefill) => toB64Url(JSON.stringify(p));

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WALL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/** Decode and clean a prefill param. Anything malformed becomes empty, never an error. */
export function decodePrefill(param: string | undefined | null): EventPrefill | null {
  if (!param || param.length > 8000) return null;
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(fromB64Url(param));
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const s = (k: string, n = 300) => (typeof raw[k] === "string" ? (raw[k] as string).slice(0, n) : "");
  const n = raw.series_no;
  return {
    title_he: s("title_he", 200),
    title_en: s("title_en", 200),
    slug: s("slug", 80).replace(/[^a-z0-9-]/g, ""),
    kind: s("kind", 20),
    series: s("series", 60).replace(/[^a-z0-9-]/g, ""),
    series_no: typeof n === "number" && Number.isInteger(n) && n > 0 && n < 100 ? n : null,
    blurb_he: s("blurb_he", 1000),
    blurb_en: s("blurb_en", 1000),
    starts_at: WALL.test(s("starts_at")) ? s("starts_at") : "",
    ends_at: WALL.test(s("ends_at")) ? s("ends_at") : "",
    venue_id: UUID.test(s("venue_id")) ? s("venue_id") : "",
    venue_note_he: s("venue_note_he", 200),
    venue_note_en: s("venue_note_en", 200),
    luma_url: /^https:\/\/\S+$/.test(s("luma_url")) ? s("luma_url") : "",
    speaker_ids: Array.isArray(raw.speaker_ids) ? raw.speaker_ids.filter((x): x is string => typeof x === "string" && UUID.test(x)).slice(0, 8) : [],
    notes: s("notes", 600),
    filled: Array.isArray(raw.filled)
      ? [...new Set(raw.filled.filter((x): x is string => typeof x === "string" && (PREFILL_FIELDS as readonly string[]).includes(x)))]
      : [],
  };
}
