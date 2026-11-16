import { expect, test } from "@playwright/test";
import { MOCK_EXTRACTION, parseExtraction } from "../../src/lib/flyer/schema";
import { decodePrefill, encodePrefill, wallTimes, type EventPrefill } from "../../src/lib/flyer/prefill";
import { matchSpeaker, matchVenue, normalizeName, slugify } from "../../src/lib/flyer/match";

// Flyer import ("upload a flyer, the event fills itself").
//  * Endpoint guard: runs everywhere (no Supabase needed). Non-admins always get 403.
//  * Pure logic (schema, defaults, prefill, matching): runs everywhere.
//  * Full mock flow as an admin: needs a dev Supabase, an admin session and FLYER_MOCK=1
//    on the server. Set E2E_ADMIN_STATE to a Playwright storageState file of a signed-in admin.

const PNG_1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const flyerForm = () => ({ flyer: { name: "flyer.png", mimeType: "image/png", buffer: PNG_1x1 } });

test.describe("flyer endpoint refuses non-admins", () => {
  test("guest (no cookie) gets 403", async ({ request }) => {
    const res = await request.post("/api/admin/flyer", { multipart: flyerForm() });
    expect(res.status()).toBe(403);
    expect(await res.json()).toEqual({ ok: false, error: "forbidden" });
    expect(res.headers()["cache-control"]).toContain("no-store");
  });

  test("a forged auth cookie still gets 403", async ({ request }) => {
    const res = await request.post("/api/admin/flyer", {
      multipart: flyerForm(),
      headers: { cookie: "sb-abcdefgh-auth-token=base64-eyJmYWtlIjp0cnVlfQ" },
    });
    expect(res.status()).toBe(403);
  });

  test("GET is not allowed", async ({ request }) => {
    const res = await request.get("/api/admin/flyer");
    expect(res.status()).toBe(405);
  });

  test("the admin page with the flyer panel redirects guests to sign-in", async ({ page }) => {
    await page.goto("/en/admin/events/new");
    await expect(page).toHaveURL(/\/en\/login\?next=%2Fadmin%2Fevents%2Fnew/);
    await expect(page.getByTestId("flyer-import")).toHaveCount(0);
  });
});

test.describe("flyer logic", () => {
  test("the mock sample passes the validator unchanged", () => {
    expect(parseExtraction(MOCK_EXTRACTION)).toEqual(MOCK_EXTRACTION);
  });

  test("the validator cleans bad model output", () => {
    const out = parseExtraction({
      ...MOCK_EXTRACTION,
      kind: "party",
      date: "13/01/2027",
      start_time: "25:00",
      luma_url: "https://evil.example/x",
      series: "Zero To Hero!",
    });
    expect(out).not.toBeNull();
    expect(out!.kind).toBe("other");
    expect(out!.date).toBe("");
    expect(out!.start_time).toBe("");
    expect(out!.luma_url).toBe("");
    expect(out!.series).toBe("zero-to-hero");
    expect(parseExtraction({ title_he: 1 })).toBeNull();
  });

  test("missing times default to 18:00–20:00 Israel time", () => {
    expect(wallTimes("2027-01-13", "", "")).toEqual({ starts_at: "2027-01-13T18:00", ends_at: "2027-01-13T20:00" });
    expect(wallTimes("2027-01-13", "17:30", "")).toEqual({ starts_at: "2027-01-13T17:30", ends_at: "2027-01-13T19:30" });
    expect(wallTimes("", "18:00", "20:00")).toEqual({ starts_at: "", ends_at: "" });
  });

  test("the prefill round-trips Hebrew and drops anything malformed", () => {
    const p: EventPrefill = {
      title_he: "מבוא לסוכני AI", title_en: "Intro", slug: "intro", kind: "lecture", series: "zero-to-hero",
      series_no: 3, blurb_he: "", blurb_en: "", starts_at: "2027-01-13T18:00", ends_at: "2027-01-13T20:00",
      venue_id: "", venue_note_he: "חדר 006", venue_note_en: "", luma_url: "https://luma.com/x",
      speaker_ids: ["00000000-0000-4000-8000-000000000001"], notes: "",
    };
    expect(decodePrefill(encodePrefill(p))).toEqual(p);
    expect(decodePrefill("not-base64!!")).toBeNull();
    const bad = decodePrefill(encodePrefill({ ...p, slug: "<script>", starts_at: "tomorrow", speaker_ids: ["x"], luma_url: "javascript:alert(1)" }));
    expect(bad).toMatchObject({ slug: "script", starts_at: "", speaker_ids: [], luma_url: "" });
  });

  test("speakers and venues match by name in either language", () => {
    const speakers = [
      { id: "a", name_he: "דנה לוי", name_en: "Dana Levi" },
      { id: "b", name_he: "עוז", name_en: "Oz" },
    ];
    expect(matchSpeaker({ name_he: "", name_en: "dana  LEVI" }, speakers)?.id).toBe("a");
    expect(matchSpeaker({ name_he: "", name_en: "Dr. Levi Dana" }, speakers)?.id).toBe("a");
    expect(matchSpeaker({ name_he: "עוֹז", name_en: "" }, speakers)?.id).toBe("b"); // niqqud
    expect(matchSpeaker({ name_he: "עֹז", name_en: "" }, speakers)?.id).toBe("b"); // spelled without vav
    expect(matchSpeaker({ name_he: "דנה לוי", name_en: "" }, [{ id: "c", name_he: "דנה ליבנה", name_en: "Dana Livne" }])).toBeNull();
    expect(matchSpeaker({ name_he: "", name_en: "Ozzy" }, speakers)).toBeNull();
    const venues = [{ id: "v", name_he: "בניין שרייבר", name_en: "Schreiber Building" }];
    expect(matchVenue("בניין שרייבר, חדר 006", venues)?.id).toBe("v");
    expect(matchVenue("Broadcom Hall", venues)).toBeNull();
    expect(normalizeName("  Prof. Ada   LOVELACE ")).toBe("ada lovelace");
    expect(slugify("Intro to AI agents!")).toBe("intro-to-ai-agents");
  });
});

test.describe("mock flow as an admin", () => {
  test.skip(!process.env.E2E_ADMIN_STATE, "needs E2E_ADMIN_STATE (admin storageState), a dev Supabase and FLYER_MOCK=1 on the server");
  test.use({ storageState: process.env.E2E_ADMIN_STATE });

  test("upload → review → fill the form as a draft, nothing published", async ({ page }) => {
    await page.goto("/en/admin/events/new");
    const panel = page.getByTestId("flyer-import");
    await expect(panel).toBeVisible();
    await expect(panel.getByText("Test mode")).toBeVisible();

    await page.getByTestId("flyer-file").setInputFiles({ name: "flyer.png", mimeType: "image/png", buffer: PNG_1x1 });
    await page.getByTestId("flyer-read").click();
    const review = page.getByTestId("flyer-review");
    await expect(review).toBeVisible();
    await expect(review).toContainText(MOCK_EXTRACTION.title_en);
    await expect(review).toContainText("18:00–20:00");
    await expect(page.getByTestId("flyer-speaker")).toHaveCount(MOCK_EXTRACTION.speakers.length);

    // Leave every speaker out so the test creates no rows.
    for (const select of await page.getByTestId("flyer-speaker").getByRole("combobox").all()) {
      await select.selectOption("skip");
    }
    await page.getByTestId("flyer-apply").click();
    await expect(page).toHaveURL(/\/en\/admin\/events\/new\?prefill=/);
    await expect(page.getByTestId("flyer-prefilled")).toBeVisible();
    await expect(page.locator('input[name="title_en"]')).toHaveValue(MOCK_EXTRACTION.title_en);
    await expect(page.locator('input[name="title_he"]')).toHaveValue(MOCK_EXTRACTION.title_he);
    await expect(page.locator('input[name="starts_at"]')).toHaveValue("2027-01-13T18:00");
    await expect(page.locator('input[name="ends_at"]')).toHaveValue("2027-01-13T20:00");
    await expect(page.locator('input[name="luma_url"]')).toHaveValue(MOCK_EXTRACTION.luma_url);
    await expect(page.locator('select[name="status"]')).toHaveValue("draft");
  });
});
