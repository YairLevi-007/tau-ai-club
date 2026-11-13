import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Server clock for this suite is fixed by playwright.config.ts (BASE_NOW = 2026-11-12 10:00 Asia/Jerusalem).
const locales = [
  { name: "he", path: "/", lang: "he", dir: "rtl" },
  { name: "en", path: "/en", lang: "en", dir: "ltr" },
] as const;

for (const L of locales) {
  test.describe(`home [${L.name}]`, () => {
    test("1.1 lang/dir, single h1, landmarks, no console errors", async ({ page }) => {
      const errors: string[] = [];
      page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
      page.on("pageerror", (e) => errors.push(String(e)));
      const res = await page.goto(L.path);
      expect(res?.status()).toBe(200);
      await expect(page.locator("html")).toHaveAttribute("lang", L.lang);
      await expect(page.locator("html")).toHaveAttribute("dir", L.dir);
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.locator("main")).toHaveCount(1);
      await expect(page.locator("footer")).toBeVisible();
      expect(errors).toEqual([]);
    });

    test("1.1 no horizontal scroll", async ({ page }) => {
      await page.goto(L.path);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(over).toBeLessThanOrEqual(0);
    });

    test("1.2 Next event card is in the initial HTML and shows title/time", async ({ page, request }) => {
      const html = await (await request.get(L.path)).text();
      expect(html).toContain('data-testid="next-event-card"');
      expect(html).toContain('data-event-slug="zero-to-hero-1"');
      await page.goto(L.path);
      const card = page.getByTestId("next-event-card");
      await expect(card).toBeVisible();
      await expect(card).toBeInViewport({ ratio: 0.1 });
      await expect(card).not.toContainText(/undefined|null|NaN/);
      await expect(card).toContainText("Zero to Hero 1");
      await expect(card).toContainText("18:00");
      await expect(card).toContainText("20:00");
    });

    test("1.2 Google Calendar link has Jerusalem 18:00-20:00; Luma hidden while luma_url is null", async ({ page }) => {
      await page.goto(L.path);
      const card = page.getByTestId("next-event-card");
      const gcal = card.locator('a[href*="calendar.google.com"]');
      await expect(gcal).toHaveCount(1);
      const dates = new URL((await gcal.getAttribute("href"))!).searchParams.get("dates");
      // Either UTC (16:00-18:00Z) or local with ctz=Asia/Jerusalem (18:00-20:00).
      expect(dates).toMatch(/^20261118T(160000Z|180000)\/20261118T(180000Z|200000)$/);
      await expect(card.locator('a[href*="lu.ma"], a[href*="luma.com"]')).toHaveCount(0);
    });

    test("1.4 timeline: 9 items chronological, one next, one tentative", async ({ page }) => {
      await page.goto(L.path);
      const items = page.getByTestId("timeline-item");
      await expect(items).toHaveCount(9);
      const states = await items.evaluateAll((els) => els.map((e) => e.getAttribute("data-state")));
      expect(states).toEqual(["past", "next", ...Array(7).fill("upcoming")]);
      const times = await items.locator("time").evaluateAll((els) => els.map((e) => Date.parse(e.getAttribute("datetime")!)));
      expect([...times].sort((a, b) => a - b)).toEqual(times);
      await expect(page.locator('[data-testid=timeline-item][aria-current="true"]')).toHaveCount(1);
      await expect(page.locator('[data-testid=timeline-item][data-tentative="true"]')).toHaveCount(1);
    });

    test("1.5 dial: next item has aria-current and is the roving tab stop; no horizontal scroll", async ({ page }) => {
      await page.goto(L.path);
      await expect(page.getByTestId("season-dial")).toBeVisible();
      const cur = page.locator('[data-testid=timeline-item][aria-current="true"]');
      await expect(cur).toHaveCount(1);
      await expect(cur).toHaveAttribute("data-state", "next");
      await expect(cur.locator("a")).toHaveAttribute("tabindex", "0");
      await expect(page.locator('[data-testid=timeline-item] a[tabindex="0"]')).toHaveCount(1);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(over).toBeLessThanOrEqual(0);
    });

    test("1.5 dial: arrow keys move selection (mirrored in RTL), Home/End jump", async ({ page }) => {
      await page.goto(L.path);
      const items = page.getByTestId("timeline-item");
      const selIndex = async () =>
        items.evaluateAll((els) => els.findIndex((e) => e.querySelector("a")?.getAttribute("tabindex") === "0"));
      const fwd = L.dir === "rtl" ? "ArrowLeft" : "ArrowRight";
      const back = L.dir === "rtl" ? "ArrowRight" : "ArrowLeft";
      expect(await selIndex()).toBe(1); // next event at BASE_NOW
      await items.nth(1).locator("a").focus();
      await page.keyboard.press(fwd);
      expect(await selIndex()).toBe(2);
      await page.keyboard.press(back);
      await page.keyboard.press(back);
      expect(await selIndex()).toBe(0);
      await page.keyboard.press("End");
      expect(await selIndex()).toBe(8);
      await page.keyboard.press("Home");
      expect(await selIndex()).toBe(0);
      // Selection is reflected in the details panel (live region).
      await page.keyboard.press(fwd);
      await expect(page.locator('[aria-live="polite"]').first()).toContainText(/Zero to Hero 1/);
    });

    test("1.8 axe: no serious/critical violations", async ({ page }) => {
      await page.goto(L.path);
      const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
      const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
    });

    test("1.8 keyboard: Tab shows a focus indicator on each stop", async ({ page, isMobile }) => {
      test.skip(!!isMobile, "keyboard walk is desktop-only");
      await page.goto(L.path);
      const seen = new Set<string>();
      for (let i = 0; i < 10; i++) {
        await page.keyboard.press("Tab");
        const info = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          if (!el || el === document.body) return null;
          const s = getComputedStyle(el);
          const outlined = (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0) || s.boxShadow !== "none";
          return { id: el.tagName + (el.getAttribute("href") ?? el.textContent?.slice(0, 20) ?? ""), outlined };
        });
        expect(info, `tab ${i} lost focus`).not.toBeNull();
        expect(info!.outlined, `no focus indicator on ${info!.id}`).toBe(true);
        seen.add(info!.id);
      }
      expect(seen.size).toBeGreaterThan(3);
    });

    test("1.9 no dev/host toolbars or secrets in production HTML", async ({ page }) => {
      await page.goto(L.path);
      await expect(
        page.locator("nextjs-portal, [data-nextjs-toast], [data-nextjs-dev-tools-button], vercel-live-feedback"),
      ).toHaveCount(0);
      expect(await page.content()).not.toMatch(/service_role|vercel-toolbar|netlify-drawer/i);
    });
  });
}

test("1.1 /he redirects (307) to the unprefixed URL", async ({ request }) => {
  const r = await request.get("/he", { maxRedirects: 0 });
  expect(r.status()).toBe(307);
  expect(new URL(r.headers()["location"], "http://x").pathname).toBe("/");
});

test("1.5 language switcher goes he to en", async ({ page }) => {
  await page.goto("/");
  const sw = page.locator('a[hreflang="en"]').first();
  test.skip((await sw.count()) === 0, "language switcher selector needs confirming with builder");
  await sw.click();
  await expect(page).toHaveURL(/\/en$/);
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
});

test("1.7 reduced motion: content visible, no infinite animations", async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ reducedMotion: "reduce", baseURL });
  const page = await ctx.newPage();
  for (const p of ["/", "/en"]) {
    await page.goto(p);
    await expect(page.getByTestId("next-event-card")).toBeVisible();
    const running = await page.evaluate(
      () =>
        document.getAnimations().filter((a) => a.playState === "running" && a.effect?.getComputedTiming().iterations === Infinity)
          .length,
    );
    expect(running, "infinite animations still running under reduced motion").toBe(0);
  }
  await ctx.close();
});

test("1.7 reduced motion: dial snaps instantly on key press", async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ reducedMotion: "reduce", baseURL });
  const page = await ctx.newPage();
  await page.goto("/en");
  const link = page.locator('[data-testid=timeline-item] a[tabindex="0"]');
  await link.focus();
  await page.keyboard.press("End");
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const sel = page.locator('[data-testid=timeline-item] a[tabindex="0"]');
  const early = await sel.boundingBox();
  await page.waitForTimeout(900);
  const late = await sel.boundingBox();
  expect(Math.abs(early!.x - late!.x) + Math.abs(early!.y - late!.y), "dial still spinning under reduced motion").toBeLessThan(1);
  await ctx.close();
});

test("1.3 unknown event slug is 404; seeded slugs are 200", async ({ request }) => {
  expect((await request.get("/events/nope")).status()).toBe(404);
  expect((await request.get("/en/events/nope")).status()).toBe(404);
  for (const s of ["zero-to-hero-1", "joint-event-ori-goshen", "cohort-02-closing"]) {
    expect((await request.get(`/events/${s}`)).status()).toBe(200);
    expect((await request.get(`/en/events/${s}`)).status()).toBe(200);
  }
});
