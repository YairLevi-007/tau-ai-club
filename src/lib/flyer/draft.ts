// The event draft an import produces (from a Luma link or from a flyer read in the browser).
// Rule-based only: no AI, no paid API. Pure module, safe on server, client and in tests.

export const EVENT_KIND_GUESSES = ["opening", "lecture", "workshop", "joint", "closing", "other"] as const;
export type DraftKind = (typeof EVENT_KIND_GUESSES)[number];

/** A speaker found by name in the imported text. `id` is the existing speaker it matched. */
export type DraftSpeaker = { id: string | null; name_he: string; name_en: string };

/** Fields the importer filled with confidence. The form highlights these for review. */
export type DraftField = "title_he" | "title_en" | "blurb_he" | "blurb_en" | "date" | "start_time" | "end_time" | "venue" | "luma_url" | "speakers" | "kind";

export type DraftHint = { what: "title" | "venue" | "date" | "time" | "ends"; text: string };

/** Empty string = not found. Times are Israel wall time. */
export type ImportDraft = {
  source: "luma" | "flyer";
  title_he: string;
  title_en: string;
  kind: DraftKind | "";
  blurb_he: string;
  blurb_en: string;
  date: string; // YYYY-MM-DD
  start_time: string; // HH:MM
  end_time: string; // HH:MM
  venue_id: string | null;
  venue_text: string;
  luma_url: string;
  image_url: string; // https://images.lumacdn.com/… (Luma cover), or ""
  speakers: DraftSpeaker[];
  filled: DraftField[];
  /** Things the importer saw but isn't sure about, shown to the admin as hints ("Possible title: …"). */
  hints: DraftHint[];
};

export const emptyDraft = (source: ImportDraft["source"]): ImportDraft => ({
  source,
  title_he: "",
  title_en: "",
  kind: "",
  blurb_he: "",
  blurb_en: "",
  date: "",
  start_time: "",
  end_time: "",
  venue_id: null,
  venue_text: "",
  luma_url: "",
  image_url: "",
  speakers: [],
  filled: [],
  hints: [],
});

export const hasHebrew = (s: string) => /[֐-׿]/.test(s);

/** Best guess at the event kind from its title/description. "" when nothing fits. */
export function guessKind(text: string): DraftKind | "" {
  const t = text.toLowerCase();
  if (/סדנ[הא]|סדנאות|workshop|hands[- ]on|hackathon|האקתון/.test(t)) return "workshop";
  if (/פתיחה|השקה|kick-?off|opening/.test(t)) return "opening";
  if (/סיום|נעילה|closing|finale/.test(t)) return "closing";
  if (/בשיתוף|משותף|joint|together with|\bx\b/.test(t)) return "joint";
  if (/הרצא[הות]|lecture|\btalk\b|keynote|מבוא|intro/.test(t)) return "lecture";
  return "";
}

/** Trim a long description down to a short blurb (whole sentences, at most `max` chars). */
export function toBlurb(text: string, max = 280) {
  const clean = text
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !/^[\p{Extended_Pictographic}\s]/u.test(l)) // drop "🗓 Tuesday" style info lines
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return (end > max / 3 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, "") + "…").trim();
}
