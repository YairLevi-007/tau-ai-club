import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type APIRequestContext } from "@playwright/test";

/**
 * QA's independent M3 guest checks. Differences from the builder's spec: the "canary" text is DERIVED from the committed seed
 * (every line of every members-only or draft section, minus anything that also appears in a public section), so the scan keeps
 * working when the seed content changes; and it scans more surfaces (RSC payloads, JS bundles, OG/meta, feeds, sitemap, 404s).
 * Runs as a guest (no Supabase env): RLS itself is covered by tests/db/m3-rls.qa.mjs.
 */
const SEED = readFileSync(path.join(__dirname, "..", "..", "supabase", "seed-m3-content.sql"), "utf8");

function seedCanaries() {
  const parts = SEED.split("$md$"); // sql, md, sql, md, ...
  const pub: string[] = [];
  const hidden: string[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    let vis: string | null = null;
    for (let j = i + 1; j < parts.length && vis === null; j += 2) vis = parts[j].match(/'(public|members)'/)?.[1] ?? null;
    (vis === "public" ? pub : hidden).push(parts[i]);
  }
  const lines = (b: string) =>
    b
      .split("\n")
      .map((l) => l.replace(/^[#>*\-\s\d.]+/, "").replace(/[*_`]/g, "").trim())
      .filter((l) => l.length >= 30)
      .map((l) => l.slice(0, 40));
  const pubText = pub.join("\n");
  return [...new Set(hidden.flatMap(lines))].filter((c) => !pubText.includes(c));
}
const CANARIES = seedCanaries();

const get = (request: APIRequestContext, p: string, headers?: Record<string, string>) => request.get(p, { maxRedirects: 0, headers });

test("seed canaries: there are plenty of members-only fragments to scan for", () => {
  expect(CANARIES.length).toBeGreaterThan(20);
});

test("lectures: canary scan of HTML, RSC payload, metadata, sitemap, feeds and bundles (he + en)", async ({ request, page }) => {
  const index = await (await request.get("/lectures")).text();
  const slugs = [...new Set([...index.matchAll(/href="\/lectures\/([a-z0-9-]+)"/g)].map((m) => m[1]))];
  expect(slugs.length).toBeGreaterThanOrEqual(3);
  const paths = ["/lectures", "/en/lectures", ...slugs.flatMap((s) => [`/lectures/${s}`, `/en/lectures/${s}`]), "/", "/en", "/sitemap.xml", "/calendar.ics", "/calendar-en.ics", "/robots.txt"];
  for (const p of paths) {
    for (const headers of [undefined, { RSC: "1" }, { RSC: "1", "Next-Router-Prefetch": "1" }] as (Record<string, string> | undefined)[]) {
      const r = await get(request, p, headers);
      expect(r.status(), `${p} ${JSON.stringify(headers)}`).toBeLessThan(400);
      const body = await r.text();
      const hit = CANARIES.find((c) => body.includes(c));
      expect(hit, `${p} ${JSON.stringify(headers)} leaked members-only text`).toBeUndefined();
    }
  }
  // After hydration: DOM, <head>, and every JS chunk the pages load.
  const chunks = new Set<string>();
  page.on("response", (r) => {
    if (/\/_next\/static\/.*\.js/.test(r.url())) chunks.add(r.url());
  });
  for (const p of ["/lectures", `/lectures/${slugs[0]}`, `/en/lectures/${slugs[0]}`]) {
    await page.goto(p);
    await page.waitForLoadState("networkidle");
    const dom = await page.content();
    const head = await page.evaluate(() => document.head.outerHTML);
    expect(CANARIES.find((c) => dom.includes(c)), `${p} DOM`).toBeUndefined();
    expect(CANARIES.find((c) => head.includes(c)), `${p} <head>/OG`).toBeUndefined();
    expect(await page.evaluate(() => (document.body.innerText || "").length)).toBeGreaterThan(100);
  }
  for (const url of chunks) {
    const js = await (await request.get(url)).text();
    expect(CANARIES.find((c) => js.includes(c)), url).toBeUndefined();
  }
});

test("lectures are public and indexable-by-design; workshops and admin content are not", async ({ request }) => {
  for (const p of ["/lectures", "/en/lectures"]) expect((await get(request, p)).status(), p).toBe(200);
  for (const p of ["/workshops", "/en/workshops", "/workshops/zero-to-hero-1", "/en/workshops/zero-to-hero-1", "/admin/content", "/en/admin/content", "/admin/content/123e4567-e89b-42d3-a456-426614174000"]) {
    let r = await get(request, p);
    for (let hop = 0; hop < 3 && [303, 307, 308].includes(r.status()) && /^\/(en\/)?admin/.test(r.headers()["location"] ?? ""); hop++) r = await get(request, r.headers()["location"]!);
    const loc = r.headers()["location"] ?? "";
    expect(([303, 307, 308].includes(r.status()) && /\/login|\/members-only/.test(loc)) || [403, 404].includes(r.status()), `${p} -> ${r.status()} ${loc}`).toBe(true);
    const body = await r.text();
    expect(CANARIES.find((c) => body.includes(c)), `${p} body`).toBeUndefined();
    expect(body, p).not.toMatch(/data-testid="(workshops-page|workshop-card|admin-content)/);
    expect(r.headers()["cache-control"] ?? "", p).not.toMatch(/public|s-maxage/);
    if (r.status() >= 300 && r.status() < 400) expect(loc, p).toMatch(/next=/); // guests come back to the page after signing in
  }
});

test("sitemap lists lectures (he+en) and nothing members-only or private", async ({ request }) => {
  const xml = await (await request.get("/sitemap.xml")).text();
  expect(xml).toMatch(/\/lectures<\/loc>/);
  expect(xml).toMatch(/\/en\/lectures<\/loc>/);
  expect(xml).toMatch(/\/lectures\/cohort-02-opening<\/loc>/);
  expect(xml).not.toMatch(/\/workshops|\/admin|\/api\/|\/login|\/members-only|\/welcome|\/profile|\/speaker\//);
  // Every URL has both language alternates.
  const urls = xml.split("<url>").slice(1);
  for (const u of urls) {
    expect(u, u.slice(0, 80)).toMatch(/hreflang="he"/);
    expect(u, u.slice(0, 80)).toMatch(/hreflang="en"/);
  }
});

test("content endpoint: guests get nothing, uncacheable, for any slug shape", async ({ request }) => {
  for (const slug of ["cohort-02-opening", "zero-to-hero-1", "no-such-event", "UPPER", "a".repeat(300), "..%2F..%2Fetc", "x%27%20or%201=1"]) {
    for (const headers of [undefined, { cookie: "sb-abcdefgh-auth-token=base64-eyJmYWtlIjp0cnVlfQ" }, { cookie: "sb-x-auth-token=garbage; other=1" }]) {
      const r = await get(request, `/api/events/${slug}/content`, headers);
      expect(r.status(), slug).toBeLessThan(500);
      if (r.status() !== 200) continue;
      const cc = r.headers()["cache-control"] ?? "";
      expect(cc, slug).toMatch(/no-store/);
      expect(cc, slug).toMatch(/private/);
      expect(r.headers()["vary"] ?? "", slug).toMatch(/cookie/i);
      const j = await r.json();
      expect(j.sections ?? [], slug).toEqual([]);
      expect(j.files ?? [], slug).toEqual([]);
      expect(["guest", "outsider"], slug).toContain(j.viewer);
    }
  }
  for (const method of ["POST", "PUT", "DELETE"] as const) {
    const r = await request.fetch("/api/events/cohort-02-opening/content", { method, maxRedirects: 0 });
    expect([403, 404, 405], method).toContain(r.status());
  }
});

test("file downloads: guests get 403/404, never a redirect or a signed URL", async ({ request }) => {
  const ids = ["00000000-0000-4000-8000-000000000001", "123e4567-e89b-42d3-a456-426614174000", "not-a-uuid", "..%2F..%2Fetc", "1", "' or 1=1 --"];
  for (const id of ids) {
    for (const headers of [undefined, { cookie: "sb-abcdefgh-auth-token=base64-eyJmYWtlIjp0cnVlfQ" }]) {
      const r = await get(request, `/api/files/${encodeURIComponent(id)}`, headers);
      expect([403, 404], id).toContain(r.status());
      expect(r.headers()["location"], id).toBeUndefined();
      expect(r.headers()["cache-control"] ?? "", id).toMatch(/no-store/);
      expect(await r.text(), id).not.toMatch(/token=|\.pdf|supabase\.co\/storage/i);
    }
  }
  const r = await request.fetch("/api/files/00000000-0000-4000-8000-000000000001", { method: "POST", maxRedirects: 0 });
  expect([403, 404, 405]).toContain(r.status());
});

test("header: Lectures and Workshops links, Workshops marked members-only, mobile section row labelled", async ({ page, isMobile }) => {
  for (const [p, lecturesText, workshopsText, rowLabel] of [
    ["/", "הרצאות", "סדנאות", "מדורים"],
    ["/en", "Lectures", "Workshops", "Sections"],
  ] as const) {
    await page.goto(p);
    const lectures = page.locator(`header a[href$="/lectures"]:visible`).first();
    const workshops = page.locator(`header a[href$="/workshops"]:visible`).first();
    await expect(lectures).toBeVisible();
    await expect(workshops).toBeVisible();
    await expect(lectures).toContainText(lecturesText);
    await expect(workshops).toContainText(workshopsText);
    // The lock must not be the only signal: the accessible name or visible text says members-only.
    const name = await workshops.evaluate((a) => `${a.getAttribute("aria-label") ?? ""} ${a.textContent ?? ""} ${a.getAttribute("title") ?? ""}`);
    expect(name, `${p} workshops link name`).toMatch(/חבר|members/i);
    if (isMobile) await expect(page.getByRole("navigation", { name: rowLabel })).toBeVisible();
    // Links work and keep the locale.
    await lectures.click();
    await expect(page).toHaveURL(new RegExp(`${p === "/" ? "" : "/en"}/lectures$`));
  }
});

test("a guest opening the Workshops link lands on sign-in and returns to /workshops afterwards", async ({ page }) => {
  await page.goto("/en");
  await page.locator('header a[href$="/workshops"]:visible').first().click();
  await expect(page).toHaveURL(/\/en\/login\?next=%2Fworkshops/);
  await expect(page.getByText("Sign in with Google").first()).toBeVisible();
});

test("keyboard: the new header links are reachable in a sensible order and show focus", async ({ page, isMobile }) => {
  test.skip(!!isMobile, "keyboard walk is desktop-only");
  await page.goto("/en");
  const seen: string[] = [];
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press("Tab");
    const s = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      const cs = getComputedStyle(el);
      return { href: el.getAttribute("href"), outlined: (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== "none" };
    });
    expect(s.outlined, `focus indicator on ${s.href}`).toBe(true);
    if (s.href) seen.push(s.href);
  }
  const iL = seen.findIndex((h) => h.endsWith("/lectures"));
  const iW = seen.findIndex((h) => h.endsWith("/workshops"));
  expect(iL, JSON.stringify(seen)).toBeGreaterThan(-1);
  expect(iW, JSON.stringify(seen)).toBeGreaterThan(iL);
});
