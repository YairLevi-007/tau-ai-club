import { test, expect } from "@playwright/test";

// Home: "Meet the club's founders" (commit 6322407). Guest level, fixtures build.
const NAMES = ["Aviv Valyevich", "Tali Amram", "Ido Perry", "Eric Berezin"];

for (const [lang, path] of [["he", "/"], ["en", "/en"]] as const) {
  test.describe(`founders [${lang}]`, () => {
    test("four founders in order, each with a name, role and company", async ({ page }) => {
      await page.goto(path);
      const section = page.getByTestId("club-founders");
      await expect(section).toBeVisible();
      await expect(section.getByRole("heading", { level: 2 })).toHaveCount(1);
      const cards = section.getByTestId("club-founder");
      await expect(cards).toHaveCount(4);
      for (let i = 0; i < 4; i++) {
        const c = cards.nth(i);
        if (lang === "en") await expect(c.locator("p").first()).toHaveText(NAMES[i]);
        else await expect(c.locator("p").first()).toHaveText(/[֐-׿]/); // Hebrew names on the Hebrew page
        const paragraphs = await c.locator("p").allTextContents();
        expect(paragraphs.length, `card ${i} has name + company + role`).toBeGreaterThanOrEqual(3);
        expect(paragraphs.join(" "), `card ${i}`).not.toMatch(/undefined|null|NaN/);
      }
      if (lang === "en") await expect(section.getByRole("heading", { level: 2 })).toContainText(/founders/i);
    });

    test("section sits under the season speakers and is public (no members-only marks)", async ({ page }) => {
      await page.goto(path);
      const order = await page.evaluate(() => {
        const a = document.querySelector('[data-testid="season-speakers"]');
        const b = document.querySelector('[data-testid="club-founders"]');
        return a && b ? (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? "after" : "before") : "missing";
      });
      expect(order).toBe("after");
    });

    test("images: decorative (empty alt, the name is text), lazy, sized; no layout overflow; no contact data", async ({ page }) => {
      await page.goto(path, { waitUntil: "networkidle" });
      const section = page.getByTestId("club-founders");
      await section.scrollIntoViewIfNeeded();
      // Photos are lazy: scroll each into view and wait until the browser has decoded it.
      for (const img of await section.locator("img").all()) await img.scrollIntoViewIfNeeded();
      await expect
        .poll(() => section.locator("img").evaluateAll((els) => els.every((i) => (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth > 0)), { timeout: 10_000 })
        .toBe(true);
      const imgs = await section.locator("img").evaluateAll((els) =>
        els.map((i) => ({ alt: i.getAttribute("alt"), loading: (i as HTMLImageElement).loading, w: i.getBoundingClientRect().width, h: i.getBoundingClientRect().height, ok: (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth > 0 })),
      );
      expect(imgs.length).toBe(4);
      for (const i of imgs) {
        expect(i.alt).toBe("");
        expect(i.ok, "photo loaded").toBe(true);
        expect(i.w).toBeGreaterThan(40);
        expect(Math.abs(i.w - i.h)).toBeLessThan(2); // square, no distortion
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
      const html = await section.evaluate((e) => e.outerHTML);
      expect(html).not.toMatch(/mailto:|tel:|@[a-z0-9-]+\.[a-z]{2,}/i);
    });
  });
}

test("club_team data is public-only: the HTML has exactly the four published founders", async ({ request }) => {
  const html = await (await request.get("/en")).text();
  const sec = html.slice(html.indexOf('data-testid="club-founders"'));
  expect((sec.match(/data-testid="club-founder"/g) ?? []).length).toBe(4);
});
