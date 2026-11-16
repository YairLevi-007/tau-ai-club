import { defineConfig } from "@playwright/test";

/** Base "now" for the production-build server: Thu 12 Nov 2026 10:00 Asia/Jerusalem (opening is past, Zero to Hero 1 is next). */
export const BASE_NOW = "2026-11-12T10:00:00+02:00";
/** NEXT_BIN is set by tests/run-isolated.mjs (snapshot runs have no node_modules of their own). */
const NEXT = `node ${process.env.NEXT_BIN ?? "node_modules/next/dist/bin/next"}`;
/** PW_PORT lets a second checkout (e.g. the M2 worktree) run the suite without sharing a server. */
const PORT = Number(process.env.PW_PORT) || 3100;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: true,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    timezoneId: "Asia/Jerusalem",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `${NEXT} build && ${NEXT} start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    timeout: 300_000,
    reuseExistingServer: !process.env.CI,
    env: { USE_FIXTURES: "1", DEBUG_NOW: BASE_NOW },
  },
  projects: [
    { name: "desktop", testIgnore: /clock\.spec/, use: { viewport: { width: 1440, height: 900 } } },
    {
      name: "mobile",
      testIgnore: /clock\.spec/,
      use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    },
    // Edge-case clock tests start their own `next dev` servers one at a time (helpers/server.ts).
    // Runs AFTER desktop/mobile (dependencies) so the dev servers never compete with the suite for CPU, and in a
    // serial file so there is exactly one dev server at a time (Next allows one per checkout).
    { name: "clock", testMatch: /clock\.spec/, dependencies: ["desktop", "mobile"], fullyParallel: false, timeout: 180_000 },
  ],
});
