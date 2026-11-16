// People on a flyer: each detected face plus the text printed right next to it (the caption a
// flyer puts under or beside a speaker photo: name, then role and company). Rule-based, pure.

import { hasHebrew } from "./draft";
import { findSpeakersInText, normalizeName } from "./match";

/** Where a caption line was read, relative to the face: under it, or on either side. */
export type CaptionRegion = "below" | "left" | "right";
/** One OCR line from a caption region. `y` is its top within the region (for reading order). */
export type CaptionLine = { text: string; confidence: number; height: number; y: number; region: CaptionRegion };

/** Name, role and company in both languages; "" when not known. */
export type PersonFields = { name_he: string; name_en: string; role_he: string; role_en: string; company_he: string; company_en: string };
export type PersonGuess = PersonFields & { speakerId: string | null };

type Named = { id: string; name_he: string; name_en: string };

const REGION_ORDER: Record<CaptionRegion, number> = { below: 0, right: 1, left: 2 };
// "Research Engineer @ Example", "CTO | Acme", "חוקרת, Example Labs", "מנהלת מוצר ב-Acme".
// A bullet is often read as "+", so " +" splits too (but "C++" doesn't).
const SPLIT = /\s*(?:@|\||·|•|,|–|—|\s-\s|\s\+|\bat\b|(?:^|\s)ב-)\s*/i;
const COMPANY_HINT = /\b(labs?|inc|ltd|llc|ai|technologies|tech|group|ventures|capital|university|google|microsoft|meta|amazon|nvidia|intel|apple|openai|anthropic|mongodb|aleph)\b|בע"מ|אוניברסיט|מעבדות/i;
const ROLE_HINT = /\b(ceo|cto|coo|cpo|vp|head|lead|director|manager|engineer|researcher|scientist|founder|co-?founder|professor|prof|phd|student|developer|designer|architect|partner|investor)\b|מנכ"?ל|סמנכ"?ל|מייסד|חוקר|מהנדס|מנהל|ראש|פרופסור|דוקטורנט|סטודנט|מפתח|שותף|משקיע|מדען/i;

const clean = (s: string) =>
  s
    .replace(/\p{Bidi_Control}/gu, "")
    .replace(/\bAl\b/g, "AI")
    .replace(/[|_~^"“”]+$/g, "")
    .replace(/^[\s|_~^•·,.:;\-–—]+|[\s|_~^•·,:;\-–—]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Tesseract keeps each word of a right-to-left line in order but puts an embedded Latin run on
 * the wrong side: "חוקרת AI, Example Labs" comes out as "AI, Example Labs חוקרת". A line that
 * starts in Latin and ends in Hebrew gets its runs swapped back (words with no letters stay with
 * the run before them).
 */
export function fixMixedRuns(s: string) {
  const he = /\p{Script=Hebrew}/u;
  const latin = /\p{Script=Latin}/u;
  const runs: { he: boolean; words: string[] }[] = [];
  for (const w of s.split(" ").filter(Boolean)) {
    const isHe = he.test(w) ? true : latin.test(w) ? false : null;
    const last = runs[runs.length - 1];
    if (last && (isHe === null || isHe === last.he)) last.words.push(w);
    else runs.push({ he: isHe ?? false, words: [w] });
  }
  if (runs.length < 2 || runs[0].he || !runs[runs.length - 1].he) return s;
  return runs
    .reverse()
    .map((r) => r.words.join(" "))
    .join(" ");
}

function usable(l: CaptionLine) {
  const text = clean(l.text);
  const letters = (text.match(/\p{L}/gu) ?? []).length;
  return l.confidence >= 40 && letters >= 2 && letters / Math.max(1, text.replace(/\s/g, "").length) >= 0.55;
}

/** Caption lines in reading order: under the face first, then beside it; top to bottom. */
export function orderCaption(lines: CaptionLine[]) {
  const sorted = lines
    .filter(usable)
    .map((l) => ({ ...l, text: fixMixedRuns(clean(l.text)) }))
    .sort((a, b) => REGION_ORDER[a.region] - REGION_ORDER[b.region] || a.y - b.y);
  // A caption is a tight group of lines: after a gap of more than ~2.5 lines, the rest of the
  // region is other flyer text (date, venue, link), not this person.
  const out: CaptionLine[] = [];
  for (const l of sorted) {
    const prev = out[out.length - 1];
    if (prev && prev.region === l.region && l.y - (prev.y + prev.height) > 2.5 * Math.max(prev.height, 12)) continue;
    out.push(l);
  }
  return out;
}

/** The text pieces offered as one-tap chips: each caption line, and its parts when it splits ("CTO · Acme"). */
export function captionChips(lines: CaptionLine[]): string[] {
  const out: string[] = [];
  for (const l of orderCaption(lines)) {
    out.push(l.text);
    const parts = l.text.split(SPLIT).map(clean).filter((p) => p.length >= 2);
    if (parts.length > 1) out.push(...parts);
  }
  return [...new Set(out)].slice(0, 12);
}

function looksLikeName(s: string) {
  const words = s.split(" ");
  return (
    words.length >= 1 &&
    words.length <= 4 &&
    s.length <= 40 &&
    !/[\d@/:+=#]|https?|\.com|\.ma\b|www\./i.test(s) &&
    !ROLE_HINT.test(s) &&
    !COMPANY_HINT.test(s) &&
    (s.match(/\p{L}/gu) ?? []).length >= 3
  );
}

/** "Role · Company" → [role, company]; a single piece is a company only if it looks like one. */
function roleAndCompany(s: string): [string, string] {
  const parts = s.split(SPLIT).map(clean).filter(Boolean);
  if (parts.length >= 2) return [parts[0], parts.slice(1).join(" ")];
  return COMPANY_HINT.test(s) && !ROLE_HINT.test(s) ? ["", s] : [s, ""];
}

/**
 * Best guess at who is in the photo, from the caption next to it. A name that matches a speaker
 * already on the site links to them; otherwise the first name-like line becomes the new
 * speaker's name and the line after it their role/company. The admin confirms every field.
 */
export function guessPerson(lines: CaptionLine[], speakers: Named[]): PersonGuess {
  const ordered = orderCaption(lines);
  const out: PersonGuess = { speakerId: null, name_he: "", name_en: "", role_he: "", role_en: "", company_he: "", company_en: "" };
  const known = findSpeakersInText(ordered.map((l) => l.text).join("\n"), speakers)[0];
  let nameAt = -1;
  if (known) {
    out.speakerId = known.id;
    out.name_he = known.name_he;
    out.name_en = known.name_en;
    const key = [known.name_he, known.name_en].map(normalizeName);
    nameAt = ordered.findIndex((l) => key.some((k) => k && normalizeName(l.text).replace(/ /g, "").includes(k.replace(/ /g, ""))));
  } else {
    // The name is usually the biggest line at the top of the caption; stray marks read off the
    // photo's edge are smaller.
    const top = ordered.slice(0, 3).filter((l) => looksLikeName(l.text));
    const biggest = top.sort((a, b) => b.height - a.height)[0];
    nameAt = biggest ? ordered.indexOf(biggest) : ordered.findIndex((l) => looksLikeName(l.text));
    if (nameAt >= 0) {
      const name = ordered[nameAt].text;
      if (hasHebrew(name)) out.name_he = name;
      else out.name_en = name;
    }
  }
  // Role and company: the next line or two after the name.
  for (const l of ordered.slice(nameAt + 1, nameAt + 3)) {
    if (looksLikeName(l.text) && !ROLE_HINT.test(l.text) && !SPLIT.test(l.text)) continue;
    const [role, company] = roleAndCompany(l.text);
    const he = hasHebrew(l.text);
    if (role && !(he ? out.role_he : out.role_en)) out[he ? "role_he" : "role_en"] = role;
    if (company && !(hasHebrew(company) ? out.company_he : out.company_en)) out[hasHebrew(company) ? "company_he" : "company_en"] = company;
  }
  return out;
}
