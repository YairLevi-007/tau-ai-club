// One command for every check. Run it from any worktree root:
//
//   node tests/run-all.mjs                 # db, typecheck + lint, then the m1, m2, m3 suites; stops at the first failure
//   node tests/run-all.mjs --only=m1,m3    # just these steps (names: db, tsc, eslint, m1, m2, m3)
//   node tests/run-all.mjs --keep-going    # run every step even after a failure (the last line still says what failed)
//
// It ends with ONE result line: "ALL PASSED ..." with the counts, or "FAILED at <step> ...", and exits 0 / 1.
//
// Two worktrees can run it at the same time: every run picks its own block of free ports (a hash of the worktree
// path decides where it starts looking, then each port is checked), and hands them to the suites through
// PW_PORT (m1), PW_CLOCK_PORT (m1 clock tests), PW_M2_PORT and PW_M3_PORT. Builds and the dev lock live in the
// worktree's own .next, so they never meet. Full logs of each step: node_modules/.cache/run-all/<step>.log.
//
// Fast first: the cheap static steps run before the slow browser suites, and typecheck + lint run side by side.
// (m1 and m3 each need their own production build, because m3 builds with the members area switched on.)
import { spawn, execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, createWriteStream, readFileSync } from "node:fs";
import net from "node:net";
import { join, resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
process.chdir(root);
const args = process.argv.slice(2);
const only = args.find((a) => a.startsWith("--only="))?.slice(7).split(",");
const keepGoing = args.includes("--keep-going");
const node = process.execPath;
const bin = (...p) => join(root, "node_modules", ...p);
const NEXT = bin("next", "dist", "bin", "next");
const PW = bin("@playwright", "test", "cli.js");
const logDir = join(root, "node_modules", ".cache", "run-all"); // not test-results/: Playwright empties that folder at every start
mkdirSync(logDir, { recursive: true });

// ---------- ports ----------
const free = (port) =>
  new Promise((ok) => {
    const s = net.createServer();
    s.once("error", () => ok(false));
    s.listen({ port, host: "0.0.0.0", exclusive: true }, () => s.close(() => ok(true)));
  });
async function pickPorts() {
  const wanted = 16; // [0] m1, [1] m2, [2] m3, [4..15] m1 clock dev servers (one per case, in order)
  let start = 4000 + (parseInt(createHash("sha1").update(root.toLowerCase()).digest("hex").slice(0, 6), 16) % 1500) * 16;
  for (let tries = 0; tries < 200; tries++, start += wanted) {
    if (start + wanted > 65000) start = 4000;
    const checks = await Promise.all(Array.from({ length: wanted }, (_, i) => free(start + i)));
    if (checks.every(Boolean)) return start;
  }
  throw new Error("no free block of ports found");
}

// ---------- running a step ----------
const kids = new Set();
const killTree = (c) => {
  try {
    if (process.platform === "win32") execSync(`taskkill /pid ${c.pid} /T /F`, { stdio: "ignore" });
    else c.kill("SIGTERM");
  } catch {}
};
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { kids.forEach(killTree); process.exit(130); });

function run(name, file, fileArgs, env = {}) {
  return new Promise((done) => {
    const log = createWriteStream(join(logDir, `${name}.log`));
    let out = "";
    const c = spawn(node, [file, ...fileArgs], { cwd: root, env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", ...env }, stdio: ["ignore", "pipe", "pipe"] });
    kids.add(c);
    const take = (d) => { log.write(d); out = (out + d).slice(-200_000); };
    c.stdout.on("data", take);
    c.stderr.on("data", take);
    c.on("close", (code) => { kids.delete(c); log.end(); done({ ok: code === 0, code, out }); });
  });
}
const counts = (out) => {
  const n = (w) => Number((out.match(new RegExp(`(\\d+) ${w}`, "g")) ?? []).pop()?.match(/\d+/)?.[0] ?? 0);
  return { passed: n("passed"), failed: n("failed"), skipped: n("skipped"), flaky: n("flaky") };
};
const tail = (out, n = 30) => out.trim().split("\n").slice(-n).join("\n");

// ---------- the steps ----------
const base = await pickPorts();
const P = { m1: base, m2: base + 1, m3: base + 2, clock: base + 4 };
const pw = (suite) => (suite === "m1" ? [PW, "test", "--reporter=line"] : [PW, "test", "-c", `tests/playwright.${suite}.config.ts`, "--reporter=line"]);
const suiteEnv = { NEXT_BIN: NEXT, PW_PORT: String(P.m1), PW_CLOCK_PORT: String(P.clock), PW_M2_PORT: String(P.m2), PW_M3_PORT: String(P.m3) };

const steps = [
  { name: "db", run: () => run("db", "scripts/check-db.mjs", []), sum: () => "ok" },
  {
    name: "tsc+eslint",
    group: true,
    run: async () => {
      const typecheck = run("tsc", NEXT, ["typegen"]).then((r) => (r.ok ? run("tsc", bin("typescript", "bin", "tsc"), ["--noEmit"]) : r));
      const lint = run("eslint", bin("eslint", "bin", "eslint.js"), []);
      const [a, b] = await Promise.all([typecheck, lint]);
      return { ok: a.ok && b.ok, out: `${a.ok ? "" : "TYPECHECK FAILED\n" + tail(a.out)}\n${b.ok ? "" : "ESLINT FAILED\n" + tail(b.out)}`, which: [!a.ok && "tsc", !b.ok && "eslint"].filter(Boolean).join("+") };
    },
    sum: () => "tsc ok, eslint ok",
  },
  ...["m1", "m2", "m3"].map((s) => ({ name: s, run: () => run(s, ...[pw(s)[0], pw(s).slice(1)], suiteEnv), sum: (r) => `${s} ${counts(r.out).passed}` })),
].filter((s) => !only || only.includes(s.name) || (s.group && only.some((o) => ["tsc", "eslint"].includes(o))));

console.log(`run-all in ${root}  (ports ${P.m1}, ${P.m2}, ${P.m3}, clock ${P.clock}+; logs in node_modules/.cache/run-all/)`);
const t0 = Date.now();
const mins = (ms) => `${Math.floor(ms / 60000)}m${String(Math.round((ms % 60000) / 1000)).padStart(2, "0")}s`;
const passed = [];
const failed = [];
for (const s of steps) {
  const t = Date.now();
  process.stdout.write(`> ${s.name} ... `);
  const r = await s.run();
  const c = counts(r.out);
  const bad = !r.ok;
  console.log(`${bad ? "FAILED" : "ok"} (${mins(Date.now() - t)}${["m1", "m2", "m3"].includes(s.name) ? `, ${c.passed} passed${c.failed ? `, ${c.failed} failed` : ""}${c.skipped ? `, ${c.skipped} skipped` : ""}${c.flaky ? `, ${c.flaky} flaky` : ""}` : ""})`);
  if (bad) {
    console.log(tail(r.out));
    failed.push(r.which ?? s.name);
    if (!keepGoing) break;
  } else passed.push(s.sum(r));
}
const total = mins(Date.now() - t0);
if (failed.length) {
  console.log(`\nFAILED at ${failed.join(", ")} after ${total}. Passed before that: ${passed.join(", ") || "nothing"}. Log: node_modules/.cache/run-all/${failed[0].split("+")[0]}.log`);
  process.exit(1);
}
console.log(`\nALL PASSED in ${total}: ${passed.join(", ")}`);
