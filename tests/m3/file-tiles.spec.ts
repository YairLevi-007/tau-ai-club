import { expect, test } from "@playwright/test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import en from "../../messages/en.json";
import he from "../../messages/he.json";
import { FileTiles, type FileKey } from "../../src/components/content/file-tiles";

// The member files as tiles with a tab (DECISIONS 25.11, files-look option A). Lecture and workshop
// pages need a signed-in member, which this suite has no Supabase for, so the tiles are rendered
// on their own and placed into a real page of the production build: its real CSS and fonts, at
// phone and desktop width, with the page's scripts blocked. The real pages pass the locale-aware
// Link (file-link.tsx).

const FILES = [
  { id: "11111111-1111-4111-8111-111111111111", title_he: "סיכום הרצאה", title_en: "Talk summary", kind: "pdf" as const },
  { id: "22222222-2222-4222-8222-222222222222", title_he: "בוחן אינטראקטיבי", title_en: "Interactive quiz", kind: "lesson" as const },
];

function markup(locale: "he" | "en") {
  const m = (locale === "he" ? he : en).content as Record<string, string>;
  const t = (k: FileKey, v?: { title: string }) => m[k].replace("{title}", v?.title ?? "");
  // A plain <a> stands in for the locale-aware Link (that one needs Next's router).
  return renderToStaticMarkup(createElement(FileTiles, { files: FILES, locale, t, LessonLink: "a" }));
}

for (const locale of ["he", "en"] as const) {
  test(`${locale}: a summary to download and a game to play, each a single link with a tab`, async ({ page }) => {
    // No scripts: React never hydrates, so nothing can redraw <main> over the injected tiles (that
    // race made this spec flaky). The server HTML still brings the real CSS and fonts.
    await page.route("**/*", (r) => (r.request().resourceType() === "script" ? r.abort() : r.continue()));
    await page.goto(locale === "he" ? "/" : "/en");
    await expect(page.locator("main")).toBeAttached();
    await page.evaluate((html) => {
      const main = document.querySelector("main")!;
      main.innerHTML = `<section style="padding:2rem 1rem;max-width:52rem;margin:auto">${html}</section>`;
    }, markup(locale));

    const tiles = page.getByTestId("file-tiles");
    const pdf = tiles.getByTestId("file-download");
    const lesson = tiles.getByTestId("lesson-open");

    // One link each, named by the full sentence a screen reader should hear.
    await expect(pdf).toHaveAttribute("href", `/api/files/${FILES[0].id}`);
    await expect(lesson).toHaveAttribute("href", new RegExp(`/lessons/${FILES[1].id}$`));
    await expect(pdf).toHaveAccessibleName(locale === "he" ? "הורדת סיכום הרצאה" : "Download Talk summary");
    await expect(lesson).toHaveAccessibleName(locale === "he" ? "שיעור אינטראקטיבי: בוחן אינטראקטיבי" : "Interactive lesson: Interactive quiz");

    // What each one is, said in words (not only by colour): the tab, the line and the button.
    await expect(pdf).toContainText(locale === "he" ? "סיכום" : "Summary");
    await expect(pdf).toContainText(locale === "he" ? "להורדה" : "Download");
    await expect(lesson).toContainText(locale === "he" ? "משחק" : "Play");
    await expect(lesson).toContainText(locale === "he" ? "לשחק עכשיו" : "Play now");

    // The tab is drawn above the tile, on its start corner, and is fully on screen.
    const tab = pdf.locator("span").first();
    const [tb, pb] = [await tab.boundingBox(), await pdf.boundingBox()];
    expect(tb!.y + tb!.height).toBeLessThanOrEqual(pb!.y + 3);
    if (locale === "he") expect(Math.abs(tb!.x + tb!.width - (pb!.x + pb!.width))).toBeLessThan(3);
    else expect(Math.abs(tb!.x - pb!.x)).toBeLessThan(3);

    // The game stands out: a solid purple button; the summary's is an outline.
    const bg = (l: typeof pdf) => l.locator("span").last().evaluate((e) => getComputedStyle(e).backgroundColor);
    expect(await bg(lesson)).not.toBe(await bg(pdf));

    // No sideways scroll, phone or desktop.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
