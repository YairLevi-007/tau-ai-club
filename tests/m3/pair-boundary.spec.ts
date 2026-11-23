import { expect, test } from "@playwright/test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

// pAIr is a bounded part of the code (docs/PAIR.md): its files reach the site only through three doorway files,
// and the site reaches pAIr only through two entry points. Then a pAIr PR touches pAIr files only.

const ROOT = resolve(__dirname, "../..");
const PAIR_DIRS = ["src/lib/pair", "src/components/pair", "src/app/[locale]/admin/pair"].map((d) => join(ROOT, d));
const DOORWAYS = ["src/lib/pair/site.ts", "src/components/pair/site-ui.ts", "src/components/pair/site-nav.ts"].map((f) => join(ROOT, f));
/** What the site may import from pAIr, by module, with the names it may use. */
const ENTRY_POINTS: Record<string, string[]> = {
  "@/lib/pair/data": ["getMyMatches", "MyMatch"],
  "@/components/pair/icebreakers-teaser": ["IcebreakersTeaser"],
};

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(name) ? [p] : [];
  });
}
const inPair = (file: string) => PAIR_DIRS.some((d) => file === d || file.startsWith(d + sep));
const rel = (file: string) => relative(ROOT, file).split(sep).join("/");

/** Every import/export-from in a file: the module and the names it takes. */
function imports(file: string) {
  const src = readFileSync(file, "utf8");
  const out: { mod: string; names: string[] }[] = [];
  const re = /(?:import|export)\s+(?:type\s+)?([\s\S]*?)\s+from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)|import\s+["']([^"']+)["']/g;
  for (const m of src.matchAll(re)) {
    const mod = m[2] ?? m[3] ?? m[4];
    const names = m[2]
      ? [...(m[1].match(/\{([^}]*)\}/)?.[1] ?? "").split(",")].map((n) => n.replace(/^\s*type\s+/, "").split(/\s+as\s+/)[0].trim()).filter(Boolean)
      : ["*"];
    if (m[2] && !m[1].includes("{")) names.push("*");
    out.push({ mod, names });
  }
  return out;
}

test.describe("pAIr boundary", () => {
  test.skip(({ isMobile }) => isMobile, "pure check: desktop project only");

  const all = walk(join(ROOT, "src"));
  const pairFiles = all.filter(inPair);

  test("the pAIr folders and the doorway files exist", () => {
    expect(pairFiles.length).toBeGreaterThan(10);
    for (const f of DOORWAYS) expect(pairFiles, rel(f)).toContain(f);
  });

  test("pAIr files reach the site only through the doorway files", () => {
    const bad: string[] = [];
    for (const file of pairFiles) {
      if (DOORWAYS.includes(file)) continue;
      for (const { mod } of imports(file)) {
        const ok = mod.startsWith("@/")
          ? mod.startsWith("@/lib/pair/") || mod.startsWith("@/components/pair/")
          : mod.startsWith(".")
            ? inPair(resolve(dirname(file), mod))
            : true; // packages (react, next-intl, lucide-react, …)
        if (!ok) bad.push(`${rel(file)} imports ${mod}`);
      }
    }
    expect(bad, "import it through src/lib/pair/site.ts, src/components/pair/site-ui.ts or site-nav.ts (docs/PAIR.md)").toEqual([]);
  });

  test("site-ui.ts and site-nav.ts are safe for client components (no server-only code)", () => {
    const code = (f: string) => readFileSync(f, "utf8").replace(/^\s*\/\/.*$/gm, "");
    for (const f of DOORWAYS.slice(1)) expect(code(f), rel(f)).not.toMatch(/server-only|@\/lib\/auth|@\/lib\/supabase|@\/lib\/pair\/site/);
    // site-ui.ts also stays loadable in plain Node, so pure pAIr pieces can be unit-tested.
    expect(code(DOORWAYS[1])).not.toMatch(/@\/i18n\/navigation/);
  });

  test("the site reaches pAIr only through its two entry points", () => {
    const bad: string[] = [];
    for (const file of all.filter((f) => !inPair(f))) {
      for (const { mod, names } of imports(file)) {
        const abs = mod.startsWith(".") ? resolve(dirname(file), mod) : null;
        const pairMod = mod.startsWith("@/lib/pair") || mod.startsWith("@/components/pair") || (abs && inPair(abs));
        if (!pairMod) continue;
        const allowed = ENTRY_POINTS[mod];
        const extra = allowed ? names.filter((n) => !allowed.includes(n)) : names;
        if (!allowed || extra.length) bad.push(`${rel(file)} imports ${extra.join(", ")} from ${mod}`);
      }
    }
    expect(bad, "the site may use only getMyMatches/MyMatch and IcebreakersTeaser from pAIr (docs/PAIR.md)").toEqual([]);
  });
});
