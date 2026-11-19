import { expect, test } from "@playwright/test";

/**
 * Mixed Hebrew/English titles (design review item 1, 19.11). In a Hebrew line the English run keeps its own
 * punctuation, so "AI, עבר ועתיד" and "Corporate, עם Google" no longer render the comma on the wrong side or
 * as the first glyph of a line:
 *   - after "AI" the comma sits between the word and the Hebrew that follows (Hebrew flow, not glued after the word);
 *   - after "Corporate" (and "Code") the comma stays glued to the word;
 *   - the comma never starts a line (a Hebrew reader meets the right edge first);
 *   - the rendered text equals the stored title (display only, no characters added);
 *   - English pages carry no <bdi> in their headings.
 * Runs in the launch setup (auth off), where /lectures and /workshops are the public previews.
 */

type Row = { title: string; word: string; sameLine: boolean; gluedAfterWord: boolean; gluedBeforeWord: boolean; leadsLine: boolean };

/** For each "<word>," in a heading: where the comma sits relative to the word and to its line (runs in the page). */
const measure = () => {
  const rows: Row[] = [];
  for (const h of document.querySelectorAll("h1, h2, h3")) {
    const text = h.textContent ?? "";
    const chars: { ch: string; l: number; r: number; t: number }[] = [];
    const walker = document.createTreeWalker(h, NodeFilter.SHOW_TEXT);
    let n: Node | null;
    while ((n = walker.nextNode())) {
      const data = (n as Text).data;
      for (let i = 0; i < data.length; i++) {
        const range = document.createRange();
        range.setStart(n, i);
        range.setEnd(n, i + 1);
        const b = range.getBoundingClientRect();
        chars.push({ ch: data[i], l: b.left, r: b.right, t: Math.round(b.top) });
      }
    }
    for (const word of ["AI", "Corporate", "Code"]) {
      const at = text.indexOf(word + ",");
      if (at < 0) continue;
      const first = chars[at];
      const last = chars[at + word.length - 1];
      const comma = chars[at + word.length];
      const lineRight = Math.max(...chars.filter((c) => c.t === comma.t && c.ch.trim()).map((c) => c.r));
      rows.push({
        title: text,
        word,
        sameLine: comma.t === last.t,
        gluedAfterWord: Math.abs(comma.l - last.r) < 2,
        gluedBeforeWord: Math.abs(comma.r - first.l) < 2,
        leadsLine: comma.r >= lineRight - 0.5,
      });
    }
  }
  return rows;
};

const WIDTHS = [320, 390, 768, 1440];

test.describe("Hebrew pages: commas in mixed titles", () => {
  // Layout is measured at explicit widths below, so one project is enough.
  test.skip(({ isMobile }) => isMobile, "measured at explicit widths in the desktop project");

  for (const path of ["/lectures", "/workshops"]) {
    test(`${path}: comma placement at ${WIDTHS.join(", ")}px`, async ({ page }) => {
      const found = new Set<string>();
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);
        await page.evaluate(() => document.fonts.ready);
        const rows = await page.evaluate(measure);
        for (const r of rows) {
          const tag = `${width}px ${path} "${r.word},"`;
          found.add(r.word);
          // "Code," keeps the accepted look from item 1; "AI," and "Corporate," are the regression targets.
          if (r.word !== "Code") expect(r.leadsLine, `${tag}: comma is the first glyph of its line (${r.title})`).toBe(false);
          if (r.word === "AI") expect(r.sameLine && r.gluedBeforeWord, `${tag}: comma should sit between "AI" and the Hebrew (${r.title})`).toBe(true);
          else expect(r.sameLine && r.gluedAfterWord, `${tag}: comma should be glued after "${r.word}" (${r.title})`).toBe(true);
        }
      }
      // The page must actually contain a title with a comma, or the test proves nothing.
      expect(found.size, `${path}: no heading with "AI," / "Corporate," / "Code," was found`).toBeGreaterThan(0);
    });
  }

  test("rendered headings equal the stored titles (no characters added)", async ({ page }) => {
    const stored = new Set<string>();
    const fx = (await import("../../src/lib/data/fixtures.json", { with: { type: "json" } })).default as { events: { title_he: string; title_en: string }[] };
    for (const e of fx.events) [e.title_he, e.title_en].forEach((t) => stored.add(t));
    for (const path of ["/lectures", "/workshops"]) {
      await page.goto(path);
        await page.evaluate(() => document.fonts.ready);
      const rows = await page.evaluate(measure);
      for (const r of rows) expect(stored.has(r.title), `${path}: "${r.title}" is not a stored title`).toBe(true);
    }
  });

  test("English pages carry no <bdi> in headings", async ({ page }) => {
    for (const path of ["/en/lectures", "/en/workshops"]) {
      await page.goto(path);
        await page.evaluate(() => document.fonts.ready);
      expect(await page.locator("h1 bdi, h2 bdi, h3 bdi").count(), `${path}: English titles must not be wrapped`).toBe(0);
    }
  });
});
