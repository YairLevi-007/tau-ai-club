import { defineConfig } from "@playwright/test";

/**
 * Milestone 3 (lecture and workshop content) specs. Runs against a PRODUCTION server
 * (`next build` first) on the seed fixtures with no Supabase env, so every visitor is a
 * guest and the leak scans look at exactly what a guest gets:
 *   USE_FIXTURES=1 node node_modules/next/dist/bin/next build
 *   node node_modules/@playwright/test/cli.js test -c tests/playwright.m3.config.ts
 * Signed-in member/admin flows need a dev Supabase plus E2E_MEMBER_STATE / E2E_ADMIN_STATE
 * (storageState files); RLS itself is covered by scripts/rls-m3-content.mjs (pnpm db:check).
 */
const PORT = Number(process.env.PW_M3_PORT) || 3730;
export default defineConfig({
  testDir: "m3",
  timeout: 60_000,
  fullyParallel: true,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, timezoneId: "Asia/Jerusalem" },
  webServer: {
    command: `node ${process.env.NEXT_BIN ?? "node_modules/next/dist/bin/next"} start -p ${PORT}`,
    cwd: "..",
    url: `http://localhost:${PORT}/en`,
    timeout: 120_000,
    reuseExistingServer: true,
    env: { USE_FIXTURES: "1", DEBUG_NOW: "2026-11-17T12:00:00+02:00", NEXT_TELEMETRY_DISABLED: "1" },
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
});
