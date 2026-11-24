import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

/**
 * No members-only lecture/workshop text reaches any public page: not the visible text,
 * not the raw HTML, not the RSC payload, not the feeds. Runs in the launch setup
 * (DATA_SOURCE=seed, members area off), where every visitor is a guest.
 *
 * The members-only text is taken from the seed itself, so new sections are covered
 * automatically: every long string literal in supabase/seed-m3-content.sql that isn't
 * also public (public content fixtures or the season seed) is cut into fragments, and
 * no fragment may appear anywhere public.
 */

const root = path.join(__dirname, "..", "..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");

/** SQL string literals ('' is an escaped quote). */
const literals = (sql: string) => [...sql.matchAll(/'((?:[^']|'')*)'/g)].map((m) => m[1].replace(/''/g, "'"));

/** Markdown down to plain words, so fragments match the rendered text too. */
const plain = (s: string) =>
  s
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_#>|]/g, " ")
    .replace(/^\s*(?:[-+]|\d+\.)\s+(?:\[[ x]\]\s+)?/gm, "")
    .replace(/\s+/g, " ")
    .trim();

const PUBLIC_TEXT = plain(read("src/lib/data/content-fixtures.json") + read("supabase/seed.sql"));

const FRAGMENTS = (() => {
  const out = new Set<string>();
  for (const lit of literals(read("supabase/seed-m3-content.sql"))) {
    if (lit.length < 80) continue; // ids, slugs, titles, enum values
    for (const line of lit.split(/\n+/)) {
      const p = plain(line);
      // Distinctive sentences only; anything also public (a shared heading) is fine.
      for (const sentence of p.split(/(?<=[.!?:])\s+/)) {
        const f = sentence.slice(0, 60).trim();
        if (f.length >= 28 && !PUBLIC_TEXT.includes(f)) out.add(f);
      }
    }
  }
  return [...out];
})();

const decode = (html: string) =>
  html
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    // RSC payload strings are JSON-escaped.
    .replace(/\\"/g, '"')
    .replace(/\\n/g, " ");

const norm = (s: string) => s.replace(/\s+/g, " ");

test("the seed really has members-only text to look for", () => {
  expect(FRAGMENTS.length).toBeGreaterThan(20);
});

test("no members-only text on any public page, feed or endpoint", async ({ request }) => {
  test.setTimeout(180_000);
  const xml = await (await request.get("/sitemap.xml")).text();
  const fromSitemap = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
  expect(fromSitemap).toContain("/learn");
  expect(fromSitemap.some((p) => /^\/en\/lectures\/[a-z0-9-]+$/.test(p))).toBe(true);

  const extra = ["/workshops", "/workshops/zero-to-hero-1", "/login", "/admin", "/profile", "/me", "/api/calendar/cohort-02-opening", "/speaker/" + "a".repeat(64), "/calendar.ics", "/calendar-en.ics"];
  const paths = [...new Set([...fromSitemap, ...extra, ...extra.map((p) => `/en${p}`).filter((p) => !p.endsWith(".ics") && !p.startsWith("/en/api/"))])];
  const slugs = [...new Set(fromSitemap.map((p) => /\/lectures\/([a-z0-9-]+)$/.exec(p)?.[1]).filter(Boolean))] as string[];
  const endpoints = [...slugs, "zero-to-hero-1"].map((s) => `/api/events/${s}/content`);

  const leaks: string[] = [];
  for (const p of [...paths, ...endpoints]) {
    const res = await request.get(p);
    expect(res.status(), p).toBeLessThan(500);
    const body = norm(decode(await res.text()));
    for (const f of FRAGMENTS) if (body.includes(f)) leaks.push(`${p}: "${f}"`);
  }
  expect(leaks).toEqual([]);
});

for (const L of [
  { prefix: "", soon: "לחברים בלבד, בקרוב" },
  { prefix: "/en", soon: "Members only, coming soon" },
] as const) {
  test(`${L.prefix || "he"}: lectures and workshops show public parts and "${L.soon}"`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    const fetched: string[] = [];
    page.on("request", (r) => {
      if (/\/api\/(events\/[^/]+\/content|files|auth)/.test(r.url())) fetched.push(r.url());
    });

    for (const p of ["/lectures/cohort-02-opening", "/learn", "/workshops/zero-to-hero-1"]) {
      const res = await page.goto(`${L.prefix}${p}`);
      expect(res?.status(), p).toBe(200);
      expect(new URL(page.url()).pathname, p).toBe(`${L.prefix}${p}`);
      await expect(page.locator("h1"), p).toBeVisible();
      await expect(page.getByTestId("members-soon"), p).toContainText(L.soon);
      // No sign-in prompt and no members' island while the area is off.
      await expect(page.getByTestId("members-locked")).toHaveCount(0);
      await expect(page.getByTestId("members-content")).toHaveCount(0);
      await expect(page.locator('a[href*="/login"], a[href*="/api/auth/"]')).toHaveCount(0);
    }
    // "שיעורים / Lessons" (24.11) still lists the season's workshops; the old list URL lands there.
    await page.goto(`${L.prefix}/workshops`);
    expect(new URL(page.url()).pathname).toBe(`${L.prefix}/learn`);
    await expect(page.getByTestId("workshop-card")).toHaveCount(3);
    // ...on its own tab on a phone (25.11): workshops showing, lectures hidden. Desktop shows both.
    await expect(page.getByTestId("tab-workshops")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("workshop-card").first()).toBeVisible();
    if (test.info().project.name !== "desktop") await expect(page.getByTestId("lessons-lectures")).toBeHidden();
    // The lecture keeps its public blurb.
    await page.goto(`${L.prefix}/lectures/cohort-02-opening`);
    await expect(page.locator('[data-testid="lecture-page"]')).toContainText(L.prefix ? "Shay Yahal" : "שי יהל");

    await page.waitForLoadState("networkidle");
    expect(fetched).toEqual([]);
    expect(errors).toEqual([]);
  });
}
