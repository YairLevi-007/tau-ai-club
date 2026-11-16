// Flyer extraction: the shape Claude returns (structured outputs), a fixed mock sample,
// and a validator. Pure module: safe in server, client and Playwright unit tests.

export const FLYER_KINDS = ["opening", "lecture", "workshop", "joint", "closing", "other"] as const;
export type FlyerKind = (typeof FLYER_KINDS)[number];

export type FlyerSpeaker = { name_he: string; name_en: string; company: string; role: string };

/** Empty string = "not on the flyer". Times are Israel wall time. */
export type FlyerExtraction = {
  title_he: string;
  title_en: string;
  kind: FlyerKind;
  series: string;
  series_no: number;
  blurb_he: string;
  blurb_en: string;
  date: string; // YYYY-MM-DD or ""
  start_time: string; // HH:MM or ""
  end_time: string; // HH:MM or ""
  venue_text: string;
  luma_url: string;
  speakers: FlyerSpeaker[];
  confidence: "low" | "medium" | "high";
  notes: string;
};

const str = { type: "string" } as const;

/** JSON Schema for output_config.format (all fields required, no extras). */
export const FLYER_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "title_he", "title_en", "kind", "series", "series_no", "blurb_he", "blurb_en", "date",
    "start_time", "end_time", "venue_text", "luma_url", "speakers", "confidence", "notes",
  ],
  properties: {
    title_he: { ...str, description: "Event title in Hebrew. Translate if the flyer has only English." },
    title_en: { ...str, description: "Event title in English. Translate if the flyer has only Hebrew." },
    kind: { type: "string", enum: [...FLYER_KINDS] },
    series: { ...str, description: "Series slug in lower-case latin letters and dashes (e.g. zero-to-hero), or empty." },
    series_no: { type: "integer", description: "Number within the series, or 0." },
    blurb_he: { ...str, description: "One or two sentences in Hebrew describing the event, only from the flyer's text. Empty if none." },
    blurb_en: { ...str, description: "The same in English. Empty if none." },
    date: { ...str, description: "YYYY-MM-DD, or empty if no date is printed." },
    start_time: { ...str, description: "HH:MM 24h Israel time, or empty if not printed." },
    end_time: { ...str, description: "HH:MM 24h Israel time, or empty if not printed." },
    venue_text: { ...str, description: "Venue exactly as printed (building, room, address), or empty." },
    luma_url: { ...str, description: "A https://luma.com/ or https://lu.ma/ link printed on the flyer, or empty. Never guess a link." },
    speakers: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name_he", "name_en", "company", "role"],
        properties: {
          name_he: { ...str, description: "Name in Hebrew letters (transliterate if printed only in English)." },
          name_en: { ...str, description: "Name in English letters (transliterate if printed only in Hebrew)." },
          company: str,
          role: str,
        },
      },
    },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    notes: { ...str, description: "Anything unclear, guessed or missing, for the admin to check. Short." },
  },
} as const;

/** Fixed result for FLYER_MOCK=1, so the whole flow runs without an API key. */
export const MOCK_EXTRACTION: FlyerExtraction = {
  title_he: "מבוא לסוכני AI",
  title_en: "Intro to AI agents",
  kind: "lecture",
  series: "zero-to-hero",
  series_no: 3,
  blurb_he: "איך בונים סוכן שמשתמש בכלים, ומתי לא כדאי.",
  blurb_en: "How to build an agent that uses tools, and when not to.",
  date: "2027-01-13",
  start_time: "",
  end_time: "",
  venue_text: "בניין שרייבר, חדר 006",
  luma_url: "https://luma.com/tau-ai-sample",
  speakers: [
    { name_he: "עוז", name_en: "Oz", company: "", role: "" },
    { name_he: "דנה לוי", name_en: "Dana Levi", company: "Example Labs", role: "Research engineer" },
  ],
  confidence: "medium",
  notes: "Mock result (FLYER_MOCK=1). No start/end time printed, so the default 18:00–20:00 was used.",
};

const isStr = (v: unknown): v is string => typeof v === "string";

/** Narrow + clean what the model returned. Returns null if the shape is wrong. */
export function parseExtraction(raw: unknown): FlyerExtraction | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const textKeys = ["title_he", "title_en", "series", "blurb_he", "blurb_en", "date", "start_time", "end_time", "venue_text", "luma_url", "notes"] as const;
  if (!textKeys.every((k) => isStr(r[k]))) return null;
  if (!Array.isArray(r.speakers)) return null;
  const clip = (s: string, n: number) => s.trim().slice(0, n);
  const speakers: FlyerSpeaker[] = [];
  for (const s of r.speakers.slice(0, 8)) {
    if (!s || typeof s !== "object") return null;
    const o = s as Record<string, unknown>;
    if (![o.name_he, o.name_en, o.company, o.role].every(isStr)) return null;
    speakers.push({
      name_he: clip(o.name_he as string, 120),
      name_en: clip(o.name_en as string, 120),
      company: clip(o.company as string, 120),
      role: clip(o.role as string, 120),
    });
  }
  const kind = FLYER_KINDS.includes(r.kind as FlyerKind) ? (r.kind as FlyerKind) : "other";
  const conf = r.confidence === "high" || r.confidence === "low" ? r.confidence : "medium";
  const s = (k: (typeof textKeys)[number], n = 300) => clip(r[k] as string, n);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(s("date")) ? s("date") : "";
  const time = (v: string) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : "");
  const luma = s("luma_url");
  return {
    title_he: s("title_he", 200),
    title_en: s("title_en", 200),
    kind,
    series: s("series", 60).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, ""),
    series_no: Number.isInteger(r.series_no) && (r.series_no as number) > 0 && (r.series_no as number) < 100 ? (r.series_no as number) : 0,
    blurb_he: s("blurb_he", 1000),
    blurb_en: s("blurb_en", 1000),
    date,
    start_time: time(s("start_time")),
    end_time: time(s("end_time")),
    venue_text: s("venue_text", 200),
    luma_url: /^https:\/\/(lu\.ma|(www\.)?luma\.com)\/\S+$/.test(luma) ? luma : "",
    speakers,
    confidence: conf,
    notes: s("notes", 600),
  };
}
