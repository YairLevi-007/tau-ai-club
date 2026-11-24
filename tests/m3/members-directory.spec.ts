import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

// The members directory (DECISIONS 25.11): /members lists everyone in the club, for signed-in
// members only. This setup can't reach Supabase, so everyone is a guest: guests get no list, and a
// forged member hint shows the nav link but never the list. The data side (member_directory() is
// empty for outsiders and refused for guests) is in scripts/rls-m2-profiles.mjs.

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
// Code only: comments may name what is left out.
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");

for (const prefix of ["", "/en"]) {
  test(`guests are sent to log in from ${prefix}/members, with no list in the page`, async ({ page }) => {
    const res = await page.goto(`${prefix}/members`);
    await expect(page).toHaveURL(new RegExp(`${prefix}/login\\?next=%2Fmembers$`));
    expect(res?.status()).toBeLessThan(500);
    await expect(page.getByTestId("members-directory")).toHaveCount(0);
    await expect(page.getByTestId("directory-member")).toHaveCount(0);
  });

  test(`a forged member hint shows the Members link, but ${prefix}/members still refuses`, async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: "tau_member", value: "1", url: baseURL! }]);
    await page.goto(`${prefix}/`);
    const link = page.locator('[data-testid="nav-members"]:visible').first();
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", `${prefix}/members`);
    await link.click();
    await expect(page).toHaveURL(new RegExp(`${prefix}/login\\?next=%2Fmembers$`));
    await expect(page.getByTestId("directory-member")).toHaveCount(0);
  });
}

test("source: members-only on the server, and only the directory's five fields reach the page", () => {
  test.skip(test.info().project.name !== "desktop", "source check: once");
  const page = code("src/app/[locale]/members/page.tsx");
  expect(page).toMatch(/await requireMember\("\/members"\)/);
  expect(page).not.toMatch(/"use client"|service|SERVICE_ROLE|email|phone|links/);
  expect(page).toMatch(/robots: \{ index: false/);
  const lib = code("src/lib/members/directory.ts");
  expect(lib).toMatch(/rpc\("member_directory"\)/);
  expect(lib).toMatch(/\(\{ id, full_name, photo_url, year, faculty \}\) => \(\{ id, full_name, photo_url, year, faculty \}\)/);
  expect(lib).not.toMatch(/from\("members"\)|from\("profiles"\)|email|phone/);
});
