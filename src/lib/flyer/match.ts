// Match names from a flyer against existing speakers and venues. Pure module.

type Named = { id: string; name_he: string; name_en: string };

/** Lower-case, strip niqqud/punctuation/titles, collapse spaces. */
export function normalizeName(s: string) {
  return s
    .normalize("NFKD")
    .replace(/[֑-ׇ]/g, "") // Hebrew niqqud and cantillation
    .replace(/[̀-ͯ]/g, "") // Latin accents
    .toLowerCase()
    .replace(/\b(dr|prof|mr|mrs|ms)\.?\s+/g, "")
    .replace(/(^|\s)(ד"ר|פרופ'|פרופ׳|ד״ר)\s*/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** The existing speaker whose Hebrew or English name matches, or null. */
export function matchSpeaker<T extends Named>(name: { name_he: string; name_en: string }, speakers: T[]): T | null {
  const wanted = [name.name_he, name.name_en].map(normalizeName).filter(Boolean);
  if (!wanted.length) return null;
  const exact = speakers.find((s) => [s.name_he, s.name_en].map(normalizeName).some((n) => wanted.includes(n)));
  if (exact) return exact;
  // Same words in another order ("Levi Dana"), only for names of two words or more.
  const key = (n: string) => n.split(" ").sort().join(" ");
  const wantedKeys = wanted.filter((w) => w.includes(" ")).map(key);
  const reordered = speakers.find((s) => [s.name_he, s.name_en].map((n) => key(normalizeName(n))).some((k) => wantedKeys.includes(k)));
  if (reordered) return reordered;
  // Hebrew spelling variants: with or without vav/yod ("עוז" / "עֹז", "דוד" / "דויד").
  const skeleton = (n: string) => n.replace(/[וי]/g, "");
  const wantedHe = wanted.filter((w) => /[א-ת]/.test(w) && skeleton(w).length >= 2).map(skeleton);
  if (!wantedHe.length) return null;
  return speakers.find((s) => wantedHe.includes(skeleton(normalizeName(s.name_he)))) ?? null;
}

/** The venue whose name appears in the printed venue text (or the other way round). */
export function matchVenue<T extends Named>(text: string, venues: T[]): T | null {
  const t = normalizeName(text);
  if (!t) return null;
  let best: T | null = null;
  let bestLen = 0;
  for (const v of venues) {
    for (const n of [v.name_he, v.name_en].map(normalizeName)) {
      if (n.length >= 3 && (t.includes(n) || n.includes(t)) && n.length > bestLen) {
        best = v;
        bestLen = n.length;
      }
    }
  }
  return best;
}

/** "Intro to AI agents" → "intro-to-ai-agents" (latin only; empty if nothing usable). */
export function slugify(s: string) {
  return normalizeName(s)
    .replace(/[^a-z0-9 ]+/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80)
    .replace(/-+$/, "");
}
