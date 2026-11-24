import { expect, test } from "@playwright/test";

// Site-wide pieces from the 25.11 feedback (launch setup, auth off):
// - one shared background on every page, rendered once by the layout (pages don't add their own);
// - the pixel cursor trail on every page: mouse only (never on touch), off under reduced motion,
//   and it never takes a click;
// - the season legend shows only Past and Next.

const PAGES = ["/", "/en", "/learn", "/en/learn", "/events/cohort-02-opening", "/lectures/cohort-02-opening", "/en/workshops/zero-to-hero-1", "/login"];

test("every page has the one shared background, and nothing else draws the logo grid behind the header", async ({ page }) => {
  for (const p of PAGES) {
    await page.goto(p);
    await expect(page.getByTestId("site-backdrop"), p).toHaveCount(1);
    // The backdrop starts at the very top, behind the header.
    const box = await page.getByTestId("site-backdrop").boundingBox();
    expect(box?.y, p).toBe(0);
    // No page-level copies of the grid or glow (the speakers block's own faded grid sits inside the page, not as a backdrop).
    const extra = await page.evaluate(
      () => [...document.querySelectorAll(".hero-glow, .hero-grid")].filter((el) => !el.closest('[data-testid="site-backdrop"]') && !el.closest("section")).length,
    );
    expect(extra, p).toBe(0);
  }
});

test("the pixel trail follows the mouse on any page and never takes a click", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop", "mouse only");
  for (const p of ["/learn", "/events/cohort-02-opening", "/login"]) {
    await page.goto(p);
    const layer = page.locator(".pixel-trail");
    await expect(layer, p).toHaveCount(1);
    await expect(layer, p).toHaveAttribute("aria-hidden", "true");
    expect(await layer.evaluate((el) => getComputedStyle(el).pointerEvents), p).toBe("none");
    await page.mouse.move(300, 300);
    await page.mouse.move(420, 360, { steps: 6 });
    expect(await layer.evaluate((el) => [...el.children].some((i) => i.getAnimations().length > 0)), p).toBe(true);
  }
  // Clicks go through the layer: the header's Lessons link still navigates.
  await page.goto("/en");
  await page.getByRole("link", { name: "Lessons" }).first().click();
  await expect(page).toHaveURL(/\/en\/learn$/);
});

test("no trail on touch screens", async ({ page }) => {
  test.skip(test.info().project.name !== "mobile", "touch only");
  await page.goto("/learn");
  await page.waitForLoadState("networkidle");
  await expect(page.locator(".pixel-trail")).toHaveCount(0);
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });
  test("no trail", async ({ page }) => {
    await page.goto("/learn");
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".pixel-trail")).toHaveCount(0);
  });
});

test("the season legend shows only Past and Next", async ({ page }) => {
  for (const [p, want] of [
    ["/", ["עבר", "הבא"]],
    ["/en", ["Past", "Next"]],
  ] as const) {
    await page.goto(p);
    const legend = page.getByRole("group", { name: p === "/" ? "מקרא" : "Legend" });
    await expect(legend, p).toHaveCount(1);
    expect((await legend.innerText()).split(/\s+/).filter(Boolean), p).toEqual([...want]);
  }
});
