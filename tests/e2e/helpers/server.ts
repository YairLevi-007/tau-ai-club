import { spawn, execSync, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import net from "node:net";

/**
 * Start `next dev` with a pinned server clock (DEBUG_NOW) on a port and wait until it answers.
 * Dev mode is used because the production build bakes "now" into ISR output; dev renders per request.
 *
 * Determinism rules (this used to flake when the whole suite ran):
 *  - Only ONE dev server may exist per checkout (Next keeps .next/dev/lock). Before spawning we wait for the
 *    previous server to be really gone (port closed and lock released); stop() waits the same way.
 *  - If the child exits early (e.g. another chat's dev server holds the lock) we fail immediately with that reason
 *    instead of polling a port nobody listens on for two minutes.
 *  - We warm the pages sequentially before the test touches them, because the first request to a route compiles
 *    it in dev and parallel cold requests can 500.
 */
const LOCK = ".next/dev/lock";

const portOpen = (port: number) =>
  new Promise<boolean>((resolve) => {
    const s = net.connect({ port, host: "127.0.0.1" }, () => {
      s.destroy();
      resolve(true);
    });
    s.on("error", () => resolve(false));
  });

const pidAlive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/** A live dev server holding the lock, or null. */
function lockHolder(): { pid: number; port: number } | null {
  if (!existsSync(LOCK)) return null;
  try {
    const l = JSON.parse(readFileSync(LOCK, "utf8")) as { pid: number; port: number };
    return pidAlive(l.pid) ? l : null;
  } catch {
    return null; // half-written or stale lock file
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitUntilIdle(label: string, ports: number[] = []) {
  const deadline = Date.now() + 30_000;
  for (;;) {
    const holder = lockHolder();
    const busy = holder || (await Promise.all(ports.map(portOpen))).some(Boolean);
    if (!busy) return;
    if (Date.now() > deadline) {
      throw new Error(
        `${label}: a dev server is still running in this checkout (${holder ? `pid ${holder.pid} on port ${holder.port}` : "port in use"}). Stop it, or run QA from its own worktree.`,
      );
    }
    await sleep(500);
  }
}

export async function startDev(now: string, port: number) {
  await waitUntilIdle("before starting", [port]);
  let exited: number | null = null;
  const child: ChildProcess = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", String(port)], {
    env: { ...process.env, USE_FIXTURES: "1", DEBUG_NOW: now, NEXT_TELEMETRY_DISABLED: "1" },
    stdio: "ignore",
  });
  child.on("exit", (code) => (exited = code ?? -1));
  const url = `http://localhost:${port}`;
  const stop = async () => {
    try {
      if (process.platform === "win32") execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: "ignore" });
      else child.kill("SIGTERM");
    } catch {}
    await waitUntilIdle("after stopping", [port]);
  };

  const deadline = Date.now() + 120_000;
  for (;;) {
    if (exited !== null) {
      const holder = lockHolder();
      await stop();
      throw new Error(`next dev exited with code ${exited} before it was ready${holder ? ` (lock held by pid ${holder.pid})` : ""}`);
    }
    try {
      const r = await fetch(url + "/en", { redirect: "manual" });
      if (r.status < 500) break;
    } catch {}
    if (Date.now() > deadline) {
      await stop();
      throw new Error("dev server did not start within 120s");
    }
    await sleep(1000);
  }
  // Warm sequentially (never in parallel): Hebrew home, then the event page template.
  for (const p of ["/", "/en", "/events/zero-to-hero-1"]) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const r = await fetch(url + p, { redirect: "manual" }).catch(() => null);
      if (r && r.status < 500) break;
      await sleep(1000);
    }
  }
  return { url, stop };
}
