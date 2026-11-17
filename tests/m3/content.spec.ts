import { readFileSync } from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// Lectures and workshops as a GUEST (no Supabase env: everyone is a guest, data from the
// seed fixtures). Members-only text must never reach a guest: not in the HTML, not in the
// RSC payload, not from the content endpoint. RLS is covered by scripts/rls-m3-content.mjs.

const SEED = readFileSync(path.join(__dirname, "..", "..", "supabase", "seed-m3-content.sql"), "utf8");
// Phrases that exist only in members-only sections of the seed.
const MEMBERS_ONLY = ["בשנת 1950 הציב אלן טיורינג", "Mechanistic Interpretability", "Paperclip Maximizer", "בין הנדסת פיצ'רים ידנית ב-Machine Learning קלאסי", "חומרה כמשאב גאו-פוליטי", "Claude Code installed on your laptop"];
const LECTURE = "cohort-02-opening";

test("the members-only phrases really are in the members-only seed", () => {
  for (const p of MEMBERS_ONLY) expect(SEED).toContain(p);
});

test.describe("lectures (public)", () => {
  test("he: /lectures lists the season's lectures, the opening one with its blurb", async ({ page }) => {
    await page.goto("/lectures");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { level: 1, name: "הרצאות" })).toBeVisible();
    const cards = page.getByTestId("lecture-card");
    await expect(cards).toHaveCount(6); // the 9 events minus the 3 workshops
    const opening = cards.filter({ hasText: "פתיחת מחזור 02" });
    await expect(opening).toContainText("שי יהל");
    await expect(opening).toContainText("ממבחן טיורינג");
    await opening.getByRole("link").click();
    await expect(page).toHaveURL(new RegExp(`/lectures/${LECTURE}$`));
  });

  test("en: the lecture page shows the English blurb and a sign-in prompt for the rest", async ({ page }) => {
    await page.goto(`/en/lectures/${LECTURE}`);
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("AI, past & future");
    await expect(page.getByTestId("content-speakers")).toContainText("Shai Yahel");
    await expect(page.getByTestId("section-blurb")).toContainText("Turing's imitation game");
    await expect(page.getByTestId("section-blurb").getByTestId("hebrew-only")).toHaveCount(0);
    const locked = page.getByTestId("members-locked");
    await expect(locked).toBeVisible();
    await expect(locked.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", /\/en\/login\?next=%2Flectures%2Fcohort-02-opening/);
    await expect(page.getByTestId("members-content")).toHaveCount(0);
  });

  test("a lecture with no write-up yet says so; workshops aren't lectures", async ({ page }) => {
    await page.goto("/lectures/growth-capital-tomer-diari");
    await expect(page.getByText("הסיכום יעלה אחרי ההרצאה.").first()).toBeVisible();
    expect((await page.goto("/lectures/zero-to-hero-1"))?.status()).toBe(404);
    expect((await page.goto("/en/lectures/no-such-lecture"))?.status()).toBe(404);
  });

  test("no members-only text in the HTML, the RSC payload or the metadata", async ({ request }) => {
    for (const p of [`/lectures/${LECTURE}`, `/en/lectures/${LECTURE}`, "/lectures", "/en/lectures", "/sitemap.xml"]) {
      for (const headers of [{}, { RSC: "1" }] as Record<string, string>[]) {
        const res = await request.get(p, { headers });
        expect(res.status(), p).toBe(200);
        const body = await res.text();
        for (const phrase of MEMBERS_ONLY) expect(body, `${p} ${JSON.stringify(headers)}: ${phrase}`).not.toContain(phrase);
      }
    }
  });

  test("the content endpoint gives guests nothing, and is never cached", async ({ request }) => {
    const res = await request.get(`/api/events/${LECTURE}/content`);
    expect(res.status()).toBe(200);
    expect(res.headers()["cache-control"]).toContain("no-store");
    expect(await res.json()).toEqual({ viewer: "guest", sections: [], files: [] });
    const forged = await request.get(`/api/events/${LECTURE}/content`, { headers: { cookie: "sb-abcdefgh-auth-token=base64-eyJmYWtlIjp0cnVlfQ" } });
    expect((await forged.json()).sections).toEqual([]);
    const bad = await request.get("/api/events/..%2F..%2Fetc/content");
    expect(((await bad.json()) as { sections: unknown[] }).sections ?? []).toEqual([]);
  });

  test("file downloads refuse guests", async ({ request }) => {
    const res = await request.get("/api/files/00000000-0000-4000-8000-000000000001", { maxRedirects: 0 });
    expect(res.status()).toBe(403);
    expect(res.headers()["cache-control"]).toContain("no-store");
    expect(res.headers()["location"]).toBeUndefined();
  });

  test("the sitemap lists lectures but not workshops", async ({ request }) => {
    const xml = await (await request.get("/sitemap.xml")).text();
    expect(xml).toContain(`/lectures/${LECTURE}</loc>`);
    expect(xml).toContain(`/en/lectures/${LECTURE}</loc>`);
    expect(xml).not.toContain("/workshops");
  });

  test("layout: no horizontal scroll, axe clean", async ({ page }) => {
    for (const p of ["/lectures", `/lectures/${LECTURE}`, "/en/lectures", `/en/lectures/${LECTURE}`]) {
      await page.goto(p);
      await page.getByTestId("members-locked").or(page.getByTestId("lectures-page")).first().waitFor();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), p).toBe(true);
      const axe = await new AxeBuilder({ page }).analyze();
      const bad = axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(" ")}`), p).toEqual([]);
    }
  });
});

test.describe("workshops (members only)", () => {
  test("guests are sent to sign in, and come back to the page", async ({ page }) => {
    await page.goto("/workshops");
    await expect(page).toHaveURL(/\/login\?next=%2Fworkshops$/);
    await page.goto("/en/workshops/zero-to-hero-1");
    await expect(page).toHaveURL(/\/en\/login\?next=%2Fworkshops%2Fzero-to-hero-1$/);
    await expect(page.getByTestId("workshop-page")).toHaveCount(0);
  });

  test("the prep checklist never reaches a guest", async ({ request }) => {
    for (const p of ["/workshops", "/workshops/zero-to-hero-1", "/en/workshops/zero-to-hero-1"]) {
      const res = await request.get(p, { maxRedirects: 0 });
      expect([303, 307, 308]).toContain(res.status());
      expect(await res.text()).not.toContain("Pro plan");
    }
  });
});

test.describe("header", () => {
  test("Lectures and Workshops links; Workshops is marked members-only in text", async ({ page, isMobile }) => {
    await page.goto("/en");
    // One copy per breakpoint (the other is display:none), so exactly one of each is visible.
    await expect(page.getByRole("link", { name: "Lectures", exact: true }).locator("visible=true")).toHaveCount(1);
    const workshops = page.getByRole("link", { name: /^Workshops/ }).locator("visible=true");
    await expect(workshops).toHaveCount(1);
    await expect(workshops).toHaveAccessibleName("Workshops (members only)");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.goto("/");
    await expect(page.getByRole("link", { name: "הרצאות" }).locator("visible=true")).toHaveCount(1);
    await expect(page.getByRole("link", { name: /סדנאות/ }).locator("visible=true")).toHaveAccessibleName("סדנאות (לחברי המועדון)");
    if (isMobile) await expect(page.getByRole("navigation", { name: "מדורים" })).toBeVisible();
  });
});

test.describe("admin content editor", () => {
  test("guests are sent to sign in", async ({ page }) => {
    await page.goto("/en/admin/content");
    await expect(page).toHaveURL(/\/en\/login\?next=%2Fadmin%2Fcontent$/);
    await page.goto("/admin/content/00000000-0000-4000-8000-000000000001");
    await expect(page).toHaveURL(/\/login\?next=/);
    await expect(page.getByTestId("admin-content-edit")).toHaveCount(0);
  });
});

test.describe("as a member", () => {
  test.skip(!process.env.E2E_MEMBER_STATE, "needs E2E_MEMBER_STATE (member storageState) and a dev Supabase");
  test.use({ storageState: process.env.E2E_MEMBER_STATE });

  test("the lecture's full write-up and the PDF; English marked Hebrew only", async ({ page }) => {
    await page.goto(`/en/lectures/${LECTURE}`);
    const content = page.getByTestId("members-content");
    await expect(content.getByTestId("section-summary")).toContainText("Mechanistic Interpretability");
    await expect(content.getByTestId("section-summary").getByTestId("hebrew-only")).toHaveText("Hebrew only for now");
    await expect(content.getByTestId("section-goals")).toBeVisible();
    await expect(content.getByTestId("section-takeaways")).toBeVisible();
    const download = content.getByTestId("file-download");
    await expect(download).toHaveAttribute("href", /^\/api\/files\/[0-9a-f-]{36}$/);
  });

  test("workshops: the prep checklist, placeholders for the rest", async ({ page }) => {
    await page.goto("/en/workshops/zero-to-hero-1");
    await expect(page.getByTestId("section-prep")).toContainText("Pro plan");
    await expect(page.getByTestId("section-commands").getByTestId("coming-soon")).toBeVisible();
  });
});

test.describe("as an admin", () => {
  test.skip(!process.env.E2E_ADMIN_STATE, "needs E2E_ADMIN_STATE (admin storageState) and a dev Supabase");
  test.use({ storageState: process.env.E2E_ADMIN_STATE });

  test("edit a section with a live preview (raw HTML shows as text)", async ({ page }) => {
    await page.goto("/en/admin/content");
    await page.getByTestId("content-event").first().click();
    const editor = page.getByTestId("editor-summary");
    await editor.getByTestId("body-en").fill("## Hello\n\n<script>window.__pwned = 1</script> **bold**");
    await editor.getByTestId("toggle-preview").click();
    await expect(editor.getByTestId("preview-en").locator("h3")).toHaveText("Hello");
    await expect(editor.getByTestId("preview-en")).toContainText("<script>");
    expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
  });
});
