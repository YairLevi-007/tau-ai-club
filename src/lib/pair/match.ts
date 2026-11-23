// pAIr's matching, ported one to one: who already met whom (from published rounds), and a new
// set of conversations that avoids repeats, with one trio when the count is odd (the trio goes to
// whoever has been in the fewest trios). Pure: no I/O.

export type PairMark = "met" | "missed" | null;
export type PairGroup = { id?: string; members: string[]; mark: PairMark };
export type PairRound = {
  id: string;
  /** The meetup's start, for "last met" and ordering. */
  date: string;
  status: "draft" | "published";
  groups: PairGroup[];
  /** member id → when they pressed "the meeting happened". */
  confirms: Map<string, string>;
};
export type PairHistory = {
  /** pairKey → how many times they met. */
  counts: Map<string, number>;
  /** member id → how many trios they were in. */
  trios: Map<string, number>;
  /** pairKey → date of the last meetup where they met. */
  last: Map<string, string>;
};

export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** A pair counts as met if an admin marked it met, or either of them confirmed; never if marked missed. */
export function pairCounted(round: PairRound, group: PairGroup, a: string, b: string) {
  if (group.mark === "missed") return false;
  if (group.mark === "met") return true;
  return round.confirms.has(a) || round.confirms.has(b);
}

export type GroupState = "met" | "partial" | "missed" | "pending";
export function groupState(round: PairRound, group: PairGroup): GroupState {
  if (group.mark === "missed") return "missed";
  if (group.mark === "met") return "met";
  const mem = group.members;
  let total = 0;
  let ok = 0;
  for (let i = 0; i < mem.length; i++) {
    for (let j = i + 1; j < mem.length; j++) {
      total++;
      if (pairCounted(round, group, mem[i], mem[j])) ok++;
    }
  }
  return ok === 0 ? "pending" : ok === total ? "met" : "partial";
}

/** Who met whom across published rounds (optionally leaving one round out). */
export function history(rounds: PairRound[], excludeId?: string): PairHistory {
  const counts = new Map<string, number>();
  const trios = new Map<string, number>();
  const last = new Map<string, string>();
  const ms = rounds.filter((r) => r.status === "published" && r.id !== excludeId).sort((a, b) => a.date.localeCompare(b.date));
  for (const m of ms) {
    for (const g of m.groups) {
      const mem = g.members;
      if (g.mark === "missed") continue;
      if (mem.length === 3) mem.forEach((x) => trios.set(x, (trios.get(x) || 0) + 1));
      for (let i = 0; i < mem.length; i++) {
        for (let j = i + 1; j < mem.length; j++) {
          if (!pairCounted(m, g, mem[i], mem[j])) continue;
          const k = pairKey(mem[i], mem[j]);
          counts.set(k, (counts.get(k) || 0) + 1);
          last.set(k, m.date);
        }
      }
    }
  }
  return { counts, trios, last };
}

function shuffle<T>(a: T[], rand: () => number) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * New conversations for these people. Many random tries, each built greedily (the trio first,
 * then the people with the fewest fresh options), improved by swapping partners between pairs;
 * the cheapest wins. A repeat costs (times met)² × 10. Returns null for fewer than 2 people.
 */
export function makeGroups(ids: string[], hist: PairHistory, rand: () => number = Math.random): string[][] | null {
  const n = ids.length;
  if (n < 2) return null;
  const c = (a: string, b: string) => hist.counts.get(pairKey(a, b)) || 0;
  const w = (a: string, b: string) => {
    const k = c(a, b);
    return k * k * 10;
  };
  const tri = (x: string) => hist.trios.get(x) || 0;
  let best: string[][] | null = null;
  let bestCost = Infinity;
  const attempts = Math.max(60, Math.min(600, 6000 / n));
  for (let t = 0; t < attempts; t++) {
    let rem = shuffle(ids.slice(), rand);
    const groups: string[][] = [];
    let cost = 0;
    if (n % 2 === 1) {
      const minTri = Math.min(...rem.map(tri));
      const pool = rem.filter((x) => tri(x) === minTri);
      const x = pool[Math.floor(rand() * pool.length)];
      rem = rem.filter((v) => v !== x);
      const y = rem.slice().sort((a, b) => w(x, a) + tri(a) - (w(x, b) + tri(b)) || rand() - 0.5)[0];
      rem = rem.filter((v) => v !== y);
      const z = rem.slice().sort((a, b) => w(x, a) + w(y, a) + tri(a) - (w(x, b) + w(y, b) + tri(b)) || rand() - 0.5)[0];
      rem = rem.filter((v) => v !== z);
      groups.push([x, y, z]);
      cost += w(x, y) + w(x, z) + w(y, z) + (tri(x) + tri(y) + tri(z)) * 0.5;
    }
    const zero = new Map(rem.map((a) => [a, rem.filter((b) => b !== a && c(a, b) === 0).length + rand() * 0.5]));
    rem.sort((a, b) => zero.get(a)! - zero.get(b)!);
    const pairs: [string, string][] = [];
    while (rem.length) {
      const a = rem.shift()!;
      let bi = 0;
      let bw = Infinity;
      for (let i = 0; i < rem.length; i++) {
        const v = w(a, rem[i]) + rand() * 0.01;
        if (v < bw) {
          bw = v;
          bi = i;
        }
      }
      pairs.push([a, rem[bi]]);
      rem.splice(bi, 1);
    }
    let improved = true;
    let pass = 0;
    while (improved && pass++ < 6) {
      improved = false;
      for (let i = 0; i < pairs.length; i++) {
        for (let j = i + 1; j < pairs.length; j++) {
          const [a, b] = pairs[i];
          const [d, e] = pairs[j];
          const cur = w(a, b) + w(d, e);
          if (w(a, d) + w(b, e) < cur) {
            pairs[i] = [a, d];
            pairs[j] = [b, e];
            improved = true;
          } else if (w(a, e) + w(b, d) < cur) {
            pairs[i] = [a, e];
            pairs[j] = [b, d];
            improved = true;
          }
        }
      }
    }
    for (const [a, b] of pairs) cost += w(a, b);
    groups.push(...pairs);
    if (cost < bestCost) {
      bestCost = cost;
      best = groups;
    }
    if (bestCost < 1 || (n % 2 === 1 && bestCost <= 1.5 * 3 * Math.min(...ids.map(tri)) + 0.01 && bestCost < 10)) break;
  }
  return best ? shuffle(best, rand) : null;
}

/** How many conversations in this set repeat a pair that already met. */
export function repeatCount(groups: string[][], hist: PairHistory) {
  return groups.filter((g) => {
    for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) if (hist.counts.get(pairKey(g[i], g[j]))) return true;
    return false;
  }).length;
}
