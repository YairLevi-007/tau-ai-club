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

/**
 * Existing speakers whose name appears in free text (a flyer read by OCR, a Luma description),
 * in the order they appear. Only names of 2+ words or 4+ letters, so "Oz" alone doesn't
 * match every "oz" in a sentence; a one-word Hebrew name of 3 letters is allowed in Hebrew text.
 */
export function findSpeakersInText<T extends Named>(text: string, speakers: T[]): T[] {
  const hay = ` ${normalizeName(text)} `;
  // OCR often glues Hebrew words ("ושייהל" for "ושי יהל"), so multi-word names are also looked
  // for with the spaces removed. Positions are taken in that joined text so the order is consistent.
  const joined = hay.replace(/ /g, "");
  const found: { s: T; at: number }[] = [];
  for (const s of speakers) {
    let at = -1;
    for (const raw of [s.name_he, s.name_en]) {
      const n = normalizeName(raw);
      const ok = n.includes(" ") || n.length >= 4 || (/^[א-ת]{3}$/.test(n) && /[א-ת]/.test(hay));
      if (!n || !ok) continue;
      // Hebrew attaches prefixes to words ("ועוז"), so allow one of ו/ב/ל/מ/ש/ה before the name.
      // `n` holds only letters, digits and spaces after normalizeName, so it is safe inside a RegExp.
      const hit = /[א-ת]/.test(n) ? hay.search(new RegExp(` [ובלמשה]?${n} `)) >= 0 : hay.includes(` ${n} `);
      const nj = n.replace(/ /g, "");
      const glued = n.includes(" ") && nj.length >= 5 && joined.includes(nj);
      if (!hit && !glued) continue;
      const i = joined.indexOf(nj);
      if (at < 0 || i < at) at = i;
    }
    if (at >= 0) found.push({ s, at });
  }
  return found.sort((a, b) => a.at - b.at).map((f) => f.s);
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
