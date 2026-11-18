import { expect, test } from "@playwright/test";

// How the lecture page renders the members' part, with the content endpoint stubbed (no
// Supabase here). Access control is NOT tested here: see content.spec.ts (guests get
// nothing) and scripts/rls-m3-content.mjs (RLS). This only checks the rendering.

const LECTURE = "cohort-02-opening";
const FILE_ID = "11111111-1111-4111-8111-111111111111";
const payload = {
  viewer: "member",
  sections: [
    { section: "takeaways", body_he: "- **הגדרת האינטליגנציה היא מטרה נעה:** ככל שטכנולוגיה פותרת רכיב מסוים.", body_en: null },
    { section: "summary", body_he: "## מבוא\n\nהאם מכונה שלומדת לשחק שחמט **באמת** מבינה?\n\n- Deep Blue\n- `Backpropagation`\n\n<script>window.__pwned=1</script>", body_en: null },
    { section: "goals", body_he: "1. להגדיר\n2. להשוות", body_en: "1. Define\n2. Compare" },
  ],
  files: [{ id: FILE_ID, title_he: "סיכום ההרצאה (PDF)", title_en: "Lecture summary (PDF, Hebrew)" }],
};

// With the members area on, the lecture page itself is members only (the server sends guests
// to log in before the island ever loads), so this rendering check needs a real member session.
test.skip(!process.env.E2E_MEMBER_STATE, "lecture pages are members only: needs E2E_MEMBER_STATE (member storageState) and a dev Supabase");
test.use({ storageState: process.env.E2E_MEMBER_STATE });

test.beforeEach(async ({ page }) => {
  await page.route(`**/api/events/${LECTURE}/content`, (route) => route.fulfill({ json: payload, headers: { "cache-control": "private, no-store" } }));
});

test("en: sections in page order; Hebrew-only parts are marked and set right-to-left", async ({ page }, info) => {
  await page.goto(`/en/lectures/${LECTURE}`);
  const content = page.getByTestId("members-content");
  await expect(content).toBeVisible();
  const ids = await content.locator("section").evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
  expect(ids).toEqual(["section-summary", "section-goals", "section-takeaways", "section-files"]);

  const summary = content.getByTestId("section-summary");
  await expect(summary.getByRole("heading", { level: 2 })).toHaveText("Summary");
  await expect(summary.getByTestId("hebrew-only")).toHaveText("Hebrew only for now");
  const body = summary.locator('[lang="he"]');
  await expect(body).toHaveAttribute("dir", "rtl");
  await expect(body.getByRole("heading", { level: 3 })).toHaveText("מבוא");
  await expect(body.locator("strong")).toHaveText("באמת");
  await expect(body.locator("code")).toHaveText("Backpropagation");
  await expect(body).toContainText("<script>");
  expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();

  // Translated sections show English with no note.
  const goals = content.getByTestId("section-goals");
  await expect(goals.getByTestId("hebrew-only")).toHaveCount(0);
  await expect(goals.locator("ol li")).toHaveText(["Define", "Compare"]);

  await expect(content.getByTestId("file-download")).toHaveAttribute("href", `/api/files/${FILE_ID}`);
  await expect(content.getByTestId("file-download")).toHaveText("Download Lecture summary (PDF, Hebrew)");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("members-en.png"), fullPage: true });
});

test("he: no Hebrew-only notes; the PDF link is in Hebrew", async ({ page }, info) => {
  await page.goto(`/lectures/${LECTURE}`);
  const content = page.getByTestId("members-content");
  await expect(content.getByTestId("section-summary").getByRole("heading", { level: 2 })).toHaveText("סיכום");
  await expect(content.getByTestId("hebrew-only")).toHaveCount(0);
  await expect(content.getByTestId("file-download")).toHaveText("הורדת סיכום ההרצאה (PDF)");
  await expect(page.getByTestId("members-locked")).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("members-he.png"), fullPage: true });
});

test("an outsider (signed in, not on the list) gets the locked panel without a sign-in button", async ({ page }) => {
  await page.unroute(`**/api/events/${LECTURE}/content`);
  await page.route(`**/api/events/${LECTURE}/content`, (route) => route.fulfill({ json: { viewer: "outsider", sections: [], files: [] } }));
  await page.goto(`/en/lectures/${LECTURE}`);
  const locked = page.getByTestId("members-locked");
  await expect(locked).toContainText("isn't on the club's list");
  await expect(locked.getByRole("link")).toHaveCount(0);
});

test("a failed load says so (no blank space)", async ({ page }) => {
  await page.unroute(`**/api/events/${LECTURE}/content`);
  await page.route(`**/api/events/${LECTURE}/content`, (route) => route.fulfill({ status: 500, body: "x" }));
  await page.goto(`/en/lectures/${LECTURE}`);
  await expect(page.getByRole("alert").filter({ hasText: "couldn't be loaded" })).toBeVisible(); // (Next's route announcer is an alert too)
});
