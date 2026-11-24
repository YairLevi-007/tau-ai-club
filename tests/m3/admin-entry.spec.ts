import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Admins get a visible way into their area (DECISIONS 25.11): an admin-only "ניהול / Admin" link
// in the header, and a real admin home at /admin. Non-admins never see the link or the page.
// This setup has the members area on and no reachable Supabase, so everyone is a guest; the
// admin's own view is checked against a mock (see the builder's notes, admin-entry/).

const ROOT = resolve(__dirname, "../..");
const src = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

test.describe("admin entry", () => {
  test("/admin sends guests to log in, back to /admin, and shows no admin content", async ({ page }) => {
    for (const p of ["/admin", "/en/admin"]) {
      const res = await page.goto(p);
      expect(res?.status(), p).toBeLessThan(500);
      await expect(page, p).toHaveURL(/\/login\?next=%2Fadmin$/);
      await expect(page.getByTestId("admin-home")).toHaveCount(0);
    }
  });

  test("a forged member hint cookie shows the member links, but never the admin link", async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: "tau_member", value: "1", url: baseURL ?? "http://localhost" }]);
    const asked = page.waitForRequest((r) => r.method() === "POST" && !!r.headers()["next-action"]);
    await page.goto("/");
    await expect(page.locator('[data-testid="member-section-links"]:visible').first()).toBeVisible();
    // The island asks the server; the server says no (not signed in), so no link appears.
    const answer = await (await asked).response();
    expect(answer?.status()).toBe(200);
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("nav-admin")).toHaveCount(0);
    expect(await page.content()).not.toMatch(/href="\/(en\/)?admin"/);
  });

  test("guests send no admin check at all, and the cached header has no admin link", async ({ page }) => {
    const actions: string[] = [];
    page.on("request", (r) => {
      if (r.headers()["next-action"]) actions.push(r.url());
    });
    await page.goto("/en");
    await page.waitForLoadState("networkidle");
    expect(actions).toEqual([]);
    await expect(page.getByTestId("nav-admin")).toHaveCount(0);
  });

  test("the link is decided on the server, from the database, for the caller only", () => {
    test.skip(test.info().project.name !== "desktop", "source check: once");
    const action = src("src/components/site/admin-nav-action.ts");
    expect(action).toMatch(/^"use server";/);
    expect(action).toMatch(/if \(!authEnabled\(\)\) return false;/);
    expect(action).toMatch(/const viewer = await getViewer\(\);\s*return viewer\.kind === "member" && viewer\.member\.role === "admin";/);
    // Takes no input, returns only a boolean.
    expect(action).toMatch(/export async function viewerIsAdmin\(\): Promise<boolean>/);
    const nav = src("src/components/site/member-nav.tsx");
    expect(nav).toMatch(/const \[admin, setAdmin\] = useState\(false\);/);
    expect(nav).toMatch(/setAdmin\(yes === true\)/);
    expect(nav).toMatch(/if \(!admin\) return null;/);
    // The admin home guards itself, like every admin page.
    expect(src("src/app/[locale]/admin/page.tsx")).toMatch(/await requireAdmin\("\/admin"\);/);
  });
});
