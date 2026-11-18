import { expect, test } from "@playwright/test";
import { authEnabled, isAuthArea } from "../../src/lib/supabase/config";

/**
 * The members area switched OFF: the state `main` ships in before Supabase Auth and the
 * Google provider exist. playwright.config.ts serves this suite in the launch setup:
 * DATA_SOURCE=seed, no Supabase env, no AUTH_ENABLED.
 *
 * Expected: the public site works from the seed, every members/admin route shows the calm
 * "בקרוב / Coming soon" page (200, noindex, same URL), there are no sign-in entry points,
 * and nothing members-only is fetched or rendered.
 */

const TOKEN = "a".repeat(64);
const AREA = ["/login", "/login?next=/admin", "/members-only", "/welcome", "/profile", "/members/00000000-0000-4000-8000-000000000001", "/admin", "/admin/members", "/admin/events", "/admin/events/new", "/admin/attendance", "/admin/speakers", `/speaker/${TOKEN}`];
const LOCALES = [
  { name: "he", prefix: "", title: "בקרוב", signIn: /כניסה עם Google|כניסה לחברים|יציאה/ },
  { name: "en", prefix: "/en", title: "Coming soon", signIn: /Sign in with Google|Sign out/ },
] as const;

for (const L of LOCALES) {
  test.describe(`auth off [${L.name}]`, () => {
    for (const p of AREA) {
      test(`${L.prefix}${p} shows "coming soon", no sign-in, no member data`, async ({ page }) => {
        const errors: string[] = [];
        page.on("pageerror", (e) => errors.push(String(e)));
        const res = await page.goto(`${L.prefix}${p}`);
        expect(res?.status()).toBe(200);
        // Rewritten, not redirected: the address bar keeps the requested path.
        expect(new URL(page.url()).pathname).toBe(`${L.prefix}${p.split("?")[0]}` || "/");
        await expect(page.getByTestId("coming-soon")).toBeVisible();
        await expect(page.locator("h1")).toHaveText(L.title);
        await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
        // Visible text and real links only: the raw HTML also carries the translation bundle.
        expect(await page.locator("body").innerText()).not.toMatch(L.signIn);
        await expect(page.locator('a[href*="/api/auth/"], a[href$="/login"], form[action*="/api/auth/"]')).toHaveCount(0);
        for (const id of ["member-row", "speaker-row", "login", "members-only", "welcome", "speaker-form"]) {
          await expect(page.getByTestId(id)).toHaveCount(0);
        }
        expect(errors).toEqual([]);
      });
    }

    test("public pages work from the seed, with no sign-in link and no members-only fetches", async ({ page }) => {
      const memberCalls: string[] = [];
      page.on("request", (r) => {
        if (/\/api\/(auth|admin|events\/[^/]+\/speaker-contacts)/.test(r.url())) memberCalls.push(r.url());
      });
      for (const path of [L.prefix || "/", `${L.prefix}/events/zero-to-hero-1`]) {
        const res = await page.goto(path);
        expect(res?.status()).toBe(200);
        await expect(page.locator("header a[href$='/login']")).toHaveCount(0);
      }
      await page.goto(L.prefix || "/");
      await expect(page.getByTestId("next-event-card")).toBeVisible();
      await page.waitForLoadState("networkidle");
      expect(memberCalls).toEqual([]);
    });
  });
}

test("/he/login redirects to /login, which shows coming soon", async ({ page }) => {
  const res = await page.goto("/he/login");
  expect(new URL(page.url()).pathname).toBe("/login");
  expect(res?.status()).toBe(200);
  await expect(page.getByTestId("coming-soon")).toBeVisible();
});

test("auth API routes degrade calmly (no 500, no data)", async ({ request }) => {
  const signin = await request.get("/api/auth/signin?locale=en&next=/admin", { maxRedirects: 0 });
  expect(signin.status()).toBe(303);
  expect(signin.headers()["location"]).toMatch(/\/en\/login\?error=unavailable$/);

  const callback = await request.get("/api/auth/callback?code=x", { maxRedirects: 0 });
  expect(callback.status()).toBe(303);
  expect(new URL(callback.headers()["location"]).pathname).toBe("/login");

  const signout = await request.post("/api/auth/signout", { form: { locale: "he" }, maxRedirects: 0 });
  expect(signout.status()).toBe(303);

  const contacts = await request.get("/api/events/zero-to-hero-1/speaker-contacts", {
    headers: { cookie: "sb-x-auth-token=forged" },
  });
  expect(contacts.status()).toBe(200);
  expect(await contacts.json()).toEqual({ contacts: {} });

  const attendance = await request.get("/api/admin/attendance?cohort=00000000-0000-4000-8000-000000000001", {
    headers: { cookie: "sb-x-auth-token=forged" },
  });
  expect(attendance.status()).toBe(403);
});

test("public pages are unchanged by the switch: sitemap lists no members routes", async ({ request }) => {
  const xml = await (await request.get("/sitemap.xml")).text();
  const paths = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname.replace(/^\/en(?=\/|$)/, "") || "/");
  expect(paths.length).toBeGreaterThan(0);
  expect(paths.filter((p) => isAuthArea(p) || p === "/coming-soon")).toEqual([]);
});

test.describe("authEnabled() needs all three conditions", () => {
  const KEYS = ["AUTH_ENABLED", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "DATA_SOURCE"] as const;
  const saved: Record<string, string | undefined> = {};
  test.beforeEach(() => KEYS.forEach((k) => (saved[k] = process.env[k])));
  test.afterEach(() => KEYS.forEach((k) => (saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k]))));
  const set = (env: Partial<Record<(typeof KEYS)[number], string | undefined>>) => {
    KEYS.forEach((k) => delete process.env[k]);
    for (const [k, v] of Object.entries(env)) if (v !== undefined) process.env[k] = v;
  };
  const full = { AUTH_ENABLED: "true", NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x" };

  test("on only with AUTH_ENABLED=true + Supabase env + not seed", () => {
    set(full);
    expect(authEnabled()).toBe(true);
    set({ ...full, AUTH_ENABLED: "1" });
    expect(authEnabled()).toBe(false);
    set({ ...full, AUTH_ENABLED: undefined });
    expect(authEnabled()).toBe(false);
    set({ ...full, NEXT_PUBLIC_SUPABASE_URL: undefined });
    expect(authEnabled()).toBe(false);
    set({ ...full, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: undefined });
    expect(authEnabled()).toBe(false);
    set({ ...full, DATA_SOURCE: "seed" });
    expect(authEnabled()).toBe(false);
  });

  test("isAuthArea matches whole path segments only", () => {
    for (const p of ["/login", "/admin", "/admin/events/new", "/members/x", "/members-only", "/profile", "/welcome", "/speaker/abc"]) {
      expect(isAuthArea(p), p).toBe(true);
    }
    for (const p of ["/", "/events/zero-to-hero-1", "/lectures", "/lectures/x", "/membership", "/administer", "/logins"]) {
      expect(isAuthArea(p), p).toBe(false);
    }
  });
});
