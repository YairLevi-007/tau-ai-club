import { test, expect } from "@playwright/test";

// Dial pop-up (JS on): clicking/tapping a node opens a dialog instead of navigating.
const L = [
  { name: "he", path: "/", prefix: "" },
  { name: "en", path: "/en", prefix: "/en" },
] as const;

for (const l of L) {
  test.describe(`dial pop-up [${l.name}]`, () => {
    const node = (page: import("@playwright/test").Page, slug: string) =>
      page.locator(`[data-testid=timeline-item] a[href$="/events/${slug}"]`);

    test("tap opens the pop-up (no navigation), focus moves inside, ARIA wired", async ({ page }) => {
      await page.goto(l.path);
      const popup = page.getByTestId("dial-popup");
      await expect(popup).toBeHidden();
      const n = node(page, "zero-to-hero-2");
      await expect(n).toHaveAttribute("aria-haspopup", "dialog");
      await n.click();
      if (!(await popup.isVisible())) await n.click(); // first tap may only select the node
      await expect(popup).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`${l.prefix || ""}/?$`));
      await expect(popup).toHaveAttribute("role", "dialog");
      await expect(popup.locator("#dial-pop-title")).toContainText("Zero to Hero 2");
      await expect(n).toHaveAttribute("aria-expanded", "true");
      expect(await popup.evaluate((el) => el.contains(document.activeElement)), "focus not inside dialog").toBe(true);
      await expect(popup).not.toContainText(/undefined|null|NaN/);
    });

    test("Esc closes and returns focus to the node", async ({ page }) => {
      await page.goto(l.path);
      const popup = page.getByTestId("dial-popup");
      const n = node(page, "zero-to-hero-1");
      await n.click();
      if (!(await popup.isVisible())) await n.click();
      await expect(popup).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(popup).toBeHidden();
      await expect(n).toBeFocused();
      await expect(n).toHaveAttribute("aria-expanded", "false");
    });

    test("close button and outside press close it", async ({ page }) => {
      await page.goto(l.path);
      const popup = page.getByTestId("dial-popup");
      const n = node(page, "zero-to-hero-1");
      await n.click();
      if (!(await popup.isVisible())) await n.click();
      await expect(popup).toBeVisible();
      await popup.getByRole("button").first().click();
      await expect(popup).toBeHidden();
      await n.click();
      if (!(await popup.isVisible())) await n.click();
      await expect(popup).toBeVisible();
      await page.getByRole("heading", { level: 1 }).click({ position: { x: 2, y: 2 } });
      await expect(popup).toBeHidden();
    });

    test("Details link navigates to the event page", async ({ page }) => {
      await page.goto(l.path);
      const popup = page.getByTestId("dial-popup");
      const n = node(page, "zero-to-hero-1");
      await n.click();
      if (!(await popup.isVisible())) await n.click();
      await expect(popup).toBeVisible();
      await popup.locator('a[href$="/events/zero-to-hero-1"]').click();
      await expect(page).toHaveURL(new RegExp(`${l.prefix}/events/zero-to-hero-1$`));
    });

    test("no horizontal scroll while open; dialog fits the viewport", async ({ page }) => {
      await page.goto(l.path);
      const popup = page.getByTestId("dial-popup");
      const n = node(page, "zero-to-hero-1");
      await n.click();
      if (!(await popup.isVisible())) await n.click();
      await expect(popup).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
      const box = (await popup.boundingBox())!;
      const vw = page.viewportSize()!.width;
      expect(box.x).toBeGreaterThanOrEqual(-1);
      expect(box.x + box.width).toBeLessThanOrEqual(vw + 1);
    });
  });
}

test("without JS nodes remain plain links", async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false, baseURL });
  const page = await ctx.newPage();
  await page.goto("/en");
  const n = page.locator('[data-testid=timeline-item] a[href$="/events/zero-to-hero-1"]');
  await n.click();
  await expect(page).toHaveURL(/\/en\/events\/zero-to-hero-1$/);
  await ctx.close();
});
