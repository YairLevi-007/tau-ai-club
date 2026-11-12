import { spawn, execSync, type ChildProcess } from "node:child_process";

/**
 * Start `next dev` with a pinned server clock (DEBUG_NOW) on a port and wait until it answers.
 * Dev mode is used because the production build bakes "now" into ISR output; dev renders per request.
 * Only one dev server can run per checkout, so callers must run serially and stop() before the next.
 */
export async function startDev(now: string, port: number) {
  const child: ChildProcess = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", String(port)], {
    env: { ...process.env, USE_FIXTURES: "1", DEBUG_NOW: now, NEXT_TELEMETRY_DISABLED: "1" },
    stdio: "ignore",
  });
  const url = `http://localhost:${port}`;
  const deadline = Date.now() + 120_000;
  for (;;) {
    try {
      const r = await fetch(url + "/en", { redirect: "manual" });
      if (r.status < 500) break;
    } catch {}
    if (Date.now() > deadline) throw new Error("dev server did not start");
    await new Promise((r) => setTimeout(r, 1000));
  }
  return {
    url,
    stop() {
      try {
        if (process.platform === "win32") execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: "ignore" });
        else child.kill("SIGTERM");
      } catch {}
    },
  };
}
