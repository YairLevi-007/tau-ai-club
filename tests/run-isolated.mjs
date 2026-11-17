// Run a QA suite against a frozen snapshot of HEAD instead of the live working tree.
//
// Why: other chats (designer, builder) edit and commit src/ in the same checkout while QA runs. Their edits trigger dev
// recompiles (500s on cold routes), change markup under a running spec, and hold the single `next dev` lock. Testing a
// snapshot makes a run reproducible: same commit in, same result out. Commit your test changes first (git archive only
// sees committed files).
//
//   node tests/run-isolated.mjs m1                 # M1 suite: desktop + mobile + clock, production build
//   node tests/run-isolated.mjs m2                 # M2 guest/leak page specs (next dev)
//   node tests/run-isolated.mjs m3                 # M3 guest/leak specs (production build of the snapshot, port 3740)
//   node tests/run-isolated.mjs m2 -g "garbage"    # extra args go to playwright
//   PW_M2_FAKE_SUPABASE=1 node tests/run-isolated.mjs m2 -g "garbage|forged"
//
// The snapshot lives in <checkout>/.qa-snapshot/<suite>-<sha> and is rebuilt every time. It has no lockfile on purpose:
// Turbopack then treats this checkout as the workspace root and finds node_modules one level up (a junction to a
// node_modules outside the root does not work, and a snapshot under node_modules crashes Turbopack). Dot-directories
// are skipped by tsc, and the folder is added to the git exclude file so `git status` stays clean.
import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const [suite, ...extra] = process.argv.slice(2);
if (!["m1", "m2", "m3"].includes(suite)) {
  console.error("usage: node tests/run-isolated.mjs <m1|m2|m3> [playwright args]");
  process.exit(2);
}
const root = resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const sha = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const dirty = execFileSync("git", ["status", "--porcelain", "--", "tests", "playwright.config.ts"], { cwd: root, encoding: "utf8" }).trim();
if (dirty) console.warn(`WARNING: uncommitted QA files are NOT in the snapshot:\n${dirty}\n`);

// A worktree whose node_modules is a junction/symlink to another checkout's install cannot be built by Turbopack
// (files outside the workspace root are not compiled). Put the snapshot inside the checkout that owns the real
// node_modules instead (the parent of the symlink target), exactly as the builder did for M3.
const nm = join(root, "node_modules");
const linked = existsSync(nm) && lstatSync(nm).isSymbolicLink();
const base = process.env.QA_SNAPSHOT_BASE ?? (linked ? join(dirname(realpathSync(nm)), ".qa-snapshot") : join(root, ".qa-snapshot"));
const snap = join(base, `${suite}-${sha}${linked ? "-" + root.split(/[\\/]/).pop() : ""}`);
if (!linked) {
  const exclude = resolve(root, execFileSync("git", ["rev-parse", "--git-path", "info/exclude"], { cwd: root, encoding: "utf8" }).trim());
  if (!existsSync(exclude) || !readFileSync(exclude, "utf8").includes(".qa-snapshot")) {
    mkdirSync(join(exclude, ".."), { recursive: true });
    appendFileSync(exclude, "\n.qa-snapshot/\n");
  }
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
    : [cli, "test", "-c", `tests/playwright.${suite}.config.ts`, "--reporter=line", ...extra];
// The M2 config lives in tests/ and uses cwd ".." relative to itself, so run from the snapshot root.
const env = { ...process.env, PW_PORT: process.env.PW_PORT ?? "3150", NEXT_BIN: join(root, "node_modules", "next", "dist", "bin", "next") };
if (suite === "m3") {
  // The M3 config serves an existing production build (guest mode, seed fixtures): build it in the snapshot first.
  const b = spawnSync(process.execPath, [env.NEXT_BIN, "build"], { cwd: snap, stdio: "inherit", env: { ...env, USE_FIXTURES: "1", NEXT_TELEMETRY_DISABLED: "1" } });
  if (b.status !== 0) process.exit(b.status ?? 1);
  env.PW_M3_PORT = process.env.PW_M3_PORT ?? "3740";
}
const r = spawnSync(process.execPath, args, { cwd: snap, stdio: "inherit", env });
process.exit(r.status ?? 1);
