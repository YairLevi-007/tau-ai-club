import { expect, test } from "@playwright/test";

// "שיעורים / Lessons" = two tabs at the top, "הרצאות | סדנאות" (DECISIONS 25.11): one shows at a
// time on phones and on desktop; linkable as /learn#lectures and /learn#workshops; the old list
// URLs open the matching tab. Runs in the launch setup (auth off: /learn is the public preview).

for (const L of [
  { prefix: "", lectures: "הרצאות", workshops: "סדנאות", next: "ArrowLeft" },
  { prefix: "/en", lectures: "Lectures", workshops: "Workshops", next: "ArrowRight" },
]) {
  test.describe(`lesson tabs ${L.prefix || "/he"}`, () => {
    test("two tabs; lectures by default; one panel at a time", async ({ page }) => {
      await page.goto(`${L.prefix}/learn`);
      const tabs = page.getByRole("tab");
      await expect(tabs).toHaveText([L.lectures, L.workshops]);
      await expect(page.getByTestId("tab-lectures")).toHaveAttribute("aria-selected", "true");
      await expect(page.getByTestId("lecture-card").first()).toBeVisible();
      await expect(page.getByTestId("lessons-workshops")).toBeHidden();
      // Each tab carries the home page's pixel glyph (a 9x9 grid), not a line icon.
      for (const id of ["tab-lectures", "tab-workshops"]) {
        await expect(page.getByTestId(id).locator('svg[viewBox="0 0 9 9"] rect').first()).toBeAttached();
      }
      // Nothing sideways on a phone; the tabs fit.
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    });

    test("clicking a tab switches the panel and the link, without jumping the page", async ({ page }) => {
      await page.goto(`${L.prefix}/learn`);
      await expect(page.getByTestId("tab-lectures")).toHaveAttribute("aria-selected", "true");
      const y = await page.evaluate(() => window.scrollY);
      await page.getByTestId("tab-workshops").click();
      await expect(page).toHaveURL(new RegExp(`${L.prefix}/learn#workshops$`));
      await expect(page.getByTestId("tab-workshops")).toHaveAttribute("aria-selected", "true");
      await expect(page.getByTestId("workshop-card")).toHaveCount(3);
      await expect(page.getByTestId("workshop-card").first()).toBeVisible();
      await expect(page.getByTestId("lessons-lectures")).toBeHidden();
      expect(Math.abs((await page.evaluate(() => window.scrollY)) - y)).toBeLessThan(80);
      await page.getByTestId("tab-lectures").click();
      await expect(page).toHaveURL(new RegExp(`${L.prefix}/learn#lectures$`));
      await expect(page.getByTestId("lessons-workshops")).toBeHidden();
      // Leaving the page drops its mark from <html>.
      await page.getByRole("link", { name: /^(TAU AI Club|.*·)/ }).first().click();
      await expect(page).toHaveURL(new RegExp(`${L.prefix || ""}/?$`));
      await expect(page.locator("html")).not.toHaveAttribute("data-lesson-tab", /.*/);
    });

    test("keyboard: arrows move between the tabs (in reading direction)", async ({ page }) => {
      await page.goto(`${L.prefix}/learn`);
      await expect(page.getByTestId("tab-lectures")).toHaveAttribute("aria-selected", "true");
      await page.getByTestId("tab-lectures").focus();
      await page.keyboard.press(L.next);
      await expect(page.getByTestId("tab-workshops")).toBeFocused();
      await expect(page.getByTestId("tab-workshops")).toHaveAttribute("aria-selected", "true");
      await expect(page.getByTestId("tab-lectures")).toHaveAttribute("tabindex", "-1");
      await page.keyboard.press("Home");
      await expect(page.getByTestId("tab-lectures")).toHaveAttribute("aria-selected", "true");
    });

    test("#workshops opens the workshops tab, from the first paint (before any JS bundle runs)", async ({ page }) => {
      // Block the app's scripts (not its CSS): only the server HTML and its inline script run.
      await page.route(/\/_next\/static\/chunks\/[^?]*\.js(\?|$)/, (r) => r.abort());
      await page.goto(`${L.prefix}/learn#workshops`);
      await expect(page.locator("html")).toHaveAttribute("data-lesson-tab", "workshops");
      await expect(page.getByTestId("workshop-card").first()).toBeVisible();
      await expect(page.getByTestId("lessons-lectures")).toBeHidden();
    });

    test("the old list URLs open the matching tab", async ({ page }) => {
      await page.goto(`${L.prefix}/workshops`);
      await expect(page).toHaveURL(new RegExp(`${L.prefix}/learn#workshops$`));
      await expect(page.getByTestId("tab-workshops")).toHaveAttribute("aria-selected", "true");
      await expect(page.getByTestId("workshop-card").first()).toBeVisible();
      await page.goto(`${L.prefix}/lectures`);
      await expect(page).toHaveURL(new RegExp(`${L.prefix}/learn#lectures$`));
      await expect(page.getByTestId("tab-lectures")).toHaveAttribute("aria-selected", "true");
      await expect(page.getByTestId("lecture-card").first()).toBeVisible();
    });
  });
}
