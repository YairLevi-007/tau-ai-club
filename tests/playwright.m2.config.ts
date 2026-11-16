import { defineConfig } from "@playwright/test";

/**
 * Milestone 2 page/leak specs. No real Supabase exists yet, so this starts `next dev` on its own port with
 * fixtures and NO Supabase env, so pages render real season data (leak scans are meaningful) and every visitor is a guest.
 * Auth redirects/PKCE need a Supabase URL: run scripts/smoke-auth.mjs for those.
 * Signed-in outsider/member/admin page behaviour needs a real Supabase project (see qa/TEST-PLAN.md section 2).
 *   node node_modules/@playwright/test/cli.js test -c tests/playwright.m2.config.ts
 */
const PORT = Number(process.env.PW_M2_PORT) || 3600;
export default defineConfig({
  testDir: "m2",
  timeout: 90_000,
  fullyParallel: true,
  retries: 0, // deterministic: m2/warmup.ts pre-compiles every route sequentially (dev cold-compile race)
  globalSetup: "./m2/warmup.ts",
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, timezoneId: "Asia/Jerusalem" },
  webServer: {
    command: `node ${process.env.NEXT_BIN ?? "node_modules/next/dist/bin/next"} dev -p ${PORT}`,
    cwd: "..",
    url: `http://localhost:${PORT}/en`,
    timeout: 180_000,
    reuseExistingServer: false,
    env: {
      USE_FIXTURES: "1",
      DEBUG_NOW: "2026-11-12T10:00:00+02:00",
      NEXT_TELEMETRY_DISABLED: "1",
      // PW_M2_FAKE_SUPABASE=1 adds an unreachable Supabase URL so auth code paths (garbage cookies etc.) execute.
      ...(process.env.PW_M2_FAKE_SUPABASE
        ? { NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fake" }
        : {}),
    },
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
});
