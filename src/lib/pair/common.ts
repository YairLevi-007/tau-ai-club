// What two (or three) members have in common, for the pAIr conversation cards. Ported one to
// one from the pAIr app (plus degree/university filler words, 23.11): it compares the free text of each profile (bio, program, faculty),
// ignores filler words, strips Hebrew one-letter prefixes (ו/ה/ב/ל/מ/ש/כ) and plural/construct
// suffixes, and knows a few synonyms. Pure: no I/O, runs on the server or in the browser.
//
// pAIr also read a separate "interests" field; the site has none (DECISIONS 18.11), so the bio
// carries that role.

export type PairProfileText = {
  bio_he?: string | null;
  bio_en?: string | null;
  faculty?: string | null;
  program?: string | null;
};

const STOP = new Set(
  (
    "אני את אתה הוא היא אנחנו הם הן אוהב אוהבת אוהבים אוהבות מאוד מאד גם של שלי על עם זה זו זאת לי יש אין הכי " +
    "בונה בונים בונות עובד עובדת עובדים מחפש מחפשת רוצה רוצים חושב חושבת מנסה " +
    "מתעניין מתעניינת מתעניינים תחום תחומי עניין כמו או וגם אבל כל הרבה קצת בעיקר עושה עושים לעשות נהנה נהנית " +
    "סטודנט סטודנטית סטודנטים שנה שנת לומד לומדת לומדים כרגע היום עכשיו מאוהב חובב חובבת אחד אחת דברים דבר " +
    // Degree and university words: almost every member has them in "program"/"faculty", so on
    // their own they say nothing ("in common: תואר").
    "תואר תארים ראשון ראשונה שני שנייה שניה שלישי שלישית דוקטורט מוסמך מוסמכת בוגר בוגרת תוכנית תכנית מסלול חוג " +
    "פקולטה פקולטת אוניברסיטה אוניברסיטת אונ תל אביב " +
    "and the i im love like loves a an of to in my me is am at for with on " +
    "degree ba bsc ma msc phd llb mba bachelor bachelors master masters program faculty university tau tel aviv year"
  ).split(/\s+/),
);

const SYN = [
  ["משחקי מחשב", "משחקי וידאו", "גיימינג", "גיימר", "גיימרית", "gaming", "gamer", "games", "videogames"],
  ["בינה מלאכותית", "ai", "למידת מכונה", "ml", "machine learning"],
  ["סטארטאפים", "סטארטאפ", "יזמות", "יזם", "יזמית", "startup", "startups"],
  ["תכנות", "קוד", "קודינג", "פיתוח", "מתכנת", "מתכנתת", "coding", "programming", "dev"],
  ["מוזיקה", "מוסיקה", "music"],
  ["טיולים", "טיול", "טיולי", "טרקים", "travel", "hiking"],
  ["כדורגל", "football", "soccer"],
  ["כדורסל", "basketball"],
  ["ספרים", "קריאה", "books", "reading"],
  ["סרטים", "קולנוע", "movies", "film"],
  ["כושר", "חדר כושר", "gym", "fitness"],
  ["בישול", "אוכל", "cooking", "food"],
  ["צילום", "photography"],
];
const PREFIX = "והבלמשכ";
// Words that mean something only inside a longer phrase ("מדעי המחשב", "computer science"):
// never shown on their own.
const LONE = new Set(["מדע", "science"]);

function stem(w: string) {
  if (w.length >= 5 && /(ים|ות)$/.test(w)) return w.slice(0, -2);
  if (w.length >= 4 && /[יה]$/.test(w) && /[֐-׿]/.test(w)) return w.slice(0, -1);
  if (w.length >= 4 && /s$/.test(w) && /^[a-z]+$/.test(w)) return w.slice(0, -1);
  return w;
}

function wordKeys(w: string) {
  const keys = new Set([w, stem(w)]);
  if (w.length >= 4 && PREFIX.includes(w[0])) {
    const r = w.slice(1);
    keys.add(r);
    keys.add(stem(r));
  }
  if (w.length >= 6 && PREFIX.includes(w[0]) && PREFIX.includes(w[1])) {
    const r = w.slice(2);
    keys.add(r);
    keys.add(stem(r));
  }
  return keys;
}

const SYN_INDEX = (() => {
  const m = new Map<string, string>();
  SYN.forEach((g, gi) => g.forEach((term) => m.set(term.toLowerCase(), "SYN" + gi)));
  return m;
})();

type Token = { raw: string; keys: Set<string> } | null;

/** Profile text → tokens; null marks a break between phrases. */
function tokenize(p: PairProfileText): Token[] {
  const about = [p.bio_he, p.bio_en].filter(Boolean).join("\n");
  const segs = [String(p.program || ""), String(p.faculty || ""), ...about.split(/[.,;:!?\n()،\-–—/]+/)];
  const out: Token[] = [];
  for (const seg of segs) {
    const words = seg
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s'"״׳]/gu, " ")
      .replace(/["״׳']/g, "")
      .split(/\s+/)
      .filter(Boolean);
    // Multi-word synonyms first (e.g. "משחקי מחשב").
    for (let i = 0; i < words.length; i++) {
      let matched = false;
      for (const len of [2, 1]) {
        if (i + len > words.length) continue;
        const phrase = words.slice(i, i + len).join(" ");
        const cand = [phrase, ...(len === 1 ? wordKeys(phrase) : [])];
        const syn =
          cand.map((c) => SYN_INDEX.get(c)).find(Boolean) ||
          (len === 2 ? [...wordKeys(words[i])].map((k) => SYN_INDEX.get(k + " " + words[i + 1])).find(Boolean) : undefined);
        if (syn && len === 2) {
          out.push({ raw: phrase, keys: new Set([syn]) });
          i += 1;
          matched = true;
          break;
        }
        if (syn && len === 1) {
          out.push({ raw: phrase, keys: new Set([syn, ...wordKeys(phrase)]) });
          matched = true;
          break;
        }
      }
      if (matched) continue;
      const w = words[i];
      if (w.length < 2 || STOP.has(w) || [...wordKeys(w)].some((k) => STOP.has(k) && k.length > 2)) {
        out.push(null);
        continue;
      }
      out.push({ raw: w, keys: wordKeys(w) });
    }
    out.push(null);
  }
  return out;
}

/** Up to six words or phrases that appear in every profile, in the first profile's words. */
export function commonInterests(people: (PairProfileText | null | undefined)[]): string[] {
  if (people.length < 2 || people.some((p) => !p)) return [];
  const toks = (people as PairProfileText[]).map(tokenize);
  const keySets = toks.slice(1).map((ts) => {
    const s = new Set<string>();
    ts.forEach((t) => t && t.keys.forEach((k) => s.add(k)));
    return s;
  });
  const inAll = (k: string) => keySets.every((ks) => ks.has(k));
  const phrases: string[] = [];
  const seen = new Set<string>();
  const push = (label: string, id: string) => {
    if (!seen.has(id)) {
      seen.add(id);
      phrases.push(label);
    }
  };
  let cur: { show: string; id: string }[] = [];
  const flush = () => {
    if (cur.length) {
      const label = cur.map((t) => t.show).join(" ");
      const lone = cur.length === 1 && (label.length <= 2 || [...wordKeys(cur[0].id)].some((k) => LONE.has(stem(k))));
      if (!lone) push(label, cur.map((t) => t.id).join(" "));
    }
    cur = [];
  };
  for (const t of toks[0]) {
    const syn = t && [...t.keys].find((k) => k.startsWith("SYN") && inAll(k));
    if (syn) {
      flush();
      push(SYN[+syn.slice(3)][0], syn);
      continue;
    }
    const key = t && [...t.keys].filter((k) => !k.startsWith("SYN") && inAll(k)).sort((a, b) => b.length - a.length)[0];
    if (!t || !key) {
      flush();
      continue;
    }
    // Show the word without a stray one-letter prefix (ו/ה/ב/ל...) when only the bare form matched.
    const show = inAll(t.raw) ? t.raw : PREFIX.includes(t.raw[0]) && wordKeys(t.raw.slice(1)).has(key) ? t.raw.slice(1) : t.raw;
    cur.push({ show, id: stem(key) });
  }
  flush();
  return phrases.slice(0, 6);
}

/**
 * What a conversation shares. For a trio with nothing common to all three, each pair's
 * common ground instead (pAIr's groupCommon).
 */
export function groupCommon<T extends PairProfileText & { id: string }>(members: T[]) {
  const all = commonInterests(members);
  const pairs: { a: T; b: T; items: string[] }[] = [];
  if (all.length || members.length < 3) return { all, pairs };
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      const items = commonInterests([members[i], members[j]]);
      if (items.length) pairs.push({ a: members[i], b: members[j], items });
    }
  }
  return { all, pairs };
}
