// Run a QA suite against a frozen snapshot of HEAD instead of the live working tree.
//
// Why: other chats (designer, builder) edit and commit src/ in the same checkout while QA runs. Their edits trigger dev
// recompiles (500s on cold routes), change markup under a running spec, and hold the single `next dev` lock. Testing a
// snapshot makes a run reproducible: same commit in, same result out. Commit your test changes first (git archive only
// sees committed files).
//
//   node tests/run-isolated.mjs m1                 # M1 suite: desktop + mobile + clock, production build
//   node tests/run-isolated.mjs m2                 # M2 guest/leak page specs (next dev)
//   node tests/run-isolated.mjs m2 -g "garbage"    # extra args go to playwright
//   PW_M2_FAKE_SUPABASE=1 node tests/run-isolated.mjs m2 -g "garbage|forged"
//
// The snapshot lives in <checkout>/.qa-snapshot/<suite>-<sha> and is rebuilt every time. It has no lockfile on purpose:
// Turbopack then treats this checkout as the workspace root and finds node_modules one level up (a junction to a
// node_modules outside the root does not work, and a snapshot under node_modules crashes Turbopack). Dot-directories
// are skipped by tsc, and the folder is added to the git exclude file so `git status` stays clean.
import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

const [suite, ...extra] = process.argv.slice(2);
if (!["m1", "m2"].includes(suite)) {
  console.error("usage: node tests/run-isolated.mjs <m1|m2> [playwright args]");
  process.exit(2);
}
const root = resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const sha = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const dirty = execFileSync("git", ["status", "--porcelain", "--", "tests", "playwright.config.ts"], { cwd: root, encoding: "utf8" }).trim();
if (dirty) console.warn(`WARNING: uncommitted QA files are NOT in the snapshot:\n${dirty}\n`);

const snap = join(root, ".qa-snapshot", `${suite}-${sha}`);
const exclude = resolve(root, execFileSync("git", ["rev-parse", "--git-path", "info/exclude"], { cwd: root, encoding: "utf8" }).trim());
if (!existsSync(exclude) || !readFileSync(exclude, "utf8").includes(".qa-snapshot")) {
  mkdirSync(join(exclude, ".."), { recursive: true });
  appendFileSync(exclude, "\n.qa-snapshot/\n");
}
rmSync(snap, { recursive: true, force: true });
mkdirSync(snap, { recursive: true });
execFileSync("git", ["archive", "--format=tar", "-o", join(snap, "src.tar"), "HEAD"], { cwd: root });
execFileSync("tar", ["-xf", "src.tar"], { cwd: snap });
rmSync(join(snap, "src.tar"));
for (const f of ["pnpm-lock.yaml", "pnpm-workspace.yaml"]) rmSync(join(snap, f), { force: true });
console.log(`snapshot of ${sha} at ${snap}`);

const cli = join(root, "node_modules", "@playwright", "test", "cli.js");
const args =
  suite === "m1"
    ? [cli, "test", "--reporter=line", ...extra]
    : [cli, "test", "-c", "tests/playwright.m2.config.ts", "--reporter=line", ...extra];
// The M2 config lives in tests/ and uses cwd ".." relative to itself, so run from the snapshot root.
const env = { ...process.env, PW_PORT: process.env.PW_PORT ?? "3150", NEXT_BIN: join(root, "node_modules", "next", "dist", "bin", "next") };
const r = spawnSync(process.execPath, args, { cwd: snap, stdio: "inherit", env });
process.exit(r.status ?? 1);
