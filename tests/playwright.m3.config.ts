import { defineConfig } from "@playwright/test";

/**
 * Milestone 3 (lecture and workshop content) specs. Builds and runs a PRODUCTION server on
 * the seed fixtures with the members area switched ON (AUTH_ENABLED=true) against an
 * unreachable Supabase URL, so every visitor is a guest and the leak scans look at exactly
 * what a guest gets once sign-in is live. (The members area OFF, the launch setup, is
 * covered by tests/e2e/members-leak.spec.ts in the main suite.)
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
    // Lecture pages are prerendered, so the auth switch must be set at build time too.
    command: `node ${process.env.NEXT_BIN ?? "node_modules/next/dist/bin/next"} build && node ${process.env.NEXT_BIN ?? "node_modules/next/dist/bin/next"} start -p ${PORT}`,
    cwd: "..",
    url: `http://localhost:${PORT}/en`,
    timeout: 300_000,
    reuseExistingServer: false,
    env: {
      USE_FIXTURES: "1",
      DEBUG_NOW: "2026-11-17T12:00:00+02:00",
      NEXT_TELEMETRY_DISABLED: "1",
      AUTH_ENABLED: "true",
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:1" /* a port nothing listens on; NOT 54321, the default local Supabase port, which a dev stack or mock may hold */,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fake",
    },
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
});
