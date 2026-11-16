import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { decodePrefill, encodePrefill, wallTimes, type EventPrefill } from "../../src/lib/flyer/prefill";
import { findSpeakersInText, matchSpeaker, matchVenue, normalizeName, slugify } from "../../src/lib/flyer/match";
import { fetchLumaPage, lumaToDraft, normalizeLumaUrl, parseLumaHtml } from "../../src/lib/flyer/luma";
import { findDates, findTimes, parseFlyerText, type OcrLine } from "../../src/lib/flyer/flyer-text";
import { captionChips, fixMixedRuns, guessPerson, type CaptionLine } from "../../src/lib/flyer/people";

// Event import on /admin/events/new: from a Luma link (server) or a flyer image (OCR in the browser).
// No AI, no paid API.
//  * Endpoint guard: runs everywhere (no Supabase needed). Non-admins always get 403.
//  * Pure logic (Luma URL guard, mocked Luma fetches, JSON-LD parsing, flyer text parsing,
//    prefill, matching): runs everywhere.
//  * The admin flow: needs a dev Supabase and an admin session. Set E2E_ADMIN_STATE to a
//    Playwright storageState file of a signed-in admin. The OCR accuracy run is flyer-ocr.spec.ts.

const LUMA_HTML = readFileSync(path.join(__dirname, "fixtures", "luma-event.html"), "utf8");
const SPEAKERS = [
  { id: "00000000-0000-4000-8000-0000000000a1", name_he: "שי יהל", name_en: "Shai Yahel" },
  { id: "00000000-0000-4000-8000-0000000000a2", name_he: "עוז", name_en: "Oz" },
  { id: "00000000-0000-4000-8000-0000000000a6", name_he: "אורי גושן", name_en: "Ori Goshen" },
];
const VENUES = [
  { id: "00000000-0000-4000-8000-0000000000b1", name_he: "אולם ברודקום", name_en: "Broadcom Hall" },
  { id: "00000000-0000-4000-8000-0000000000b2", name_he: "המרכז ליזמות", name_en: "Entrepreneurship Center" },
];
const TODAY = new Date("2026-11-16T10:00:00Z");

test.describe("Luma import endpoint refuses non-admins", () => {
  const body = { url: "https://luma.com/tau-ai-agents" };

  test("guest (no cookie) gets 403", async ({ request }) => {
    const res = await request.post("/api/admin/luma", { data: body });
    expect(res.status()).toBe(403);
    expect(await res.json()).toEqual({ ok: false, error: "forbidden" });
    expect(res.headers()["cache-control"]).toContain("no-store");
  });

  test("a forged auth cookie still gets 403", async ({ request }) => {
    const res = await request.post("/api/admin/luma", { data: body, headers: { cookie: "sb-abcdefgh-auth-token=base64-eyJmYWtlIjp0cnVlfQ" } });
    expect(res.status()).toBe(403);
  });

  test("GET is not allowed", async ({ request }) => {
    expect((await request.get("/api/admin/luma")).status()).toBe(405);
  });

  test("the old Claude flyer endpoint is gone", async ({ request }) => {
    // No route any more: Next answers with a 4xx (400 for a multipart POST, 404 for GET), never the old JSON.
    const res = await request.post("/api/admin/flyer", { multipart: { x: "1" } });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
    expect((await request.get("/api/admin/flyer")).status()).toBe(404);
  });

  test("the admin page with the import panel redirects guests to sign-in", async ({ page }) => {
    await page.goto("/en/admin/events/new");
    await expect(page).toHaveURL(/\/en\/login\?next=%2Fadmin%2Fevents%2Fnew/);
    await expect(page.getByTestId("flyer-import")).toHaveCount(0);
  });
});

test.describe("Luma import logic", () => {
  test("only plain Luma event links are accepted", () => {
    expect(normalizeLumaUrl("lu.ma/abc123")).toBe("https://lu.ma/abc123");
    expect(normalizeLumaUrl("https://luma.com/tau-ai-agents?utm=x#top")).toBe("https://luma.com/tau-ai-agents");
    expect(normalizeLumaUrl("http://www.luma.com/event/evt-123/")).toBe("https://www.luma.com/event/evt-123");
    for (const bad of [
      "https://evil.example/abc",
      "https://luma.com.evil.example/abc",
      "https://user:pw@luma.com/abc",
      "https://luma.com:8443/abc",
      "https://luma.com/",
      "https://luma.com/a/b/c",
      "javascript:alert(1)",
      "file:///etc/passwd",
      "https://127.0.0.1/abc",
    ]) {
      expect(normalizeLumaUrl(bad), bad).toBeNull();
    }
    // Dot segments are resolved by the URL parser and stay on the Luma host.
    expect(normalizeLumaUrl("https://luma.com/%2e%2e/admin")).toBe("https://luma.com/admin");
  });

  // A fake Luma: every call is recorded so we can check which hosts were contacted.
  const fakeFetch = (routes: Record<string, () => Response>) => {
    const calls: string[] = [];
    const fetcher = async (url: string, init: RequestInit) => {
      calls.push(url);
      expect(init.redirect).toBe("manual");
      const r = routes[url];
      if (!r) throw new Error(`unexpected fetch ${url}`);
      return r();
    };
    return { calls, fetcher };
  };
  const html = (body: string, headers: Record<string, string> = {}) => new Response(body, { status: 200, headers: { "content-type": "text/html; charset=utf-8", ...headers } });

  test("follows lu.ma → luma.com and reads the page", async () => {
    const { calls, fetcher } = fakeFetch({
      "https://lu.ma/tau-ai-agents": () => new Response(null, { status: 301, headers: { location: "https://luma.com/tau-ai-agents" } }),
      "https://luma.com/tau-ai-agents": () => html(LUMA_HTML),
    });
    const res = await fetchLumaPage("https://lu.ma/tau-ai-agents", { fetcher });
    expect(res).toMatchObject({ ok: true, url: "https://luma.com/tau-ai-agents" });
    expect(calls).toEqual(["https://lu.ma/tau-ai-agents", "https://luma.com/tau-ai-agents"]);
  });

  test("refuses a redirect to another host, and never fetches it", async () => {
    const { calls, fetcher } = fakeFetch({
      "https://luma.com/abc": () => new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data" } }),
    });
    expect(await fetchLumaPage("https://luma.com/abc", { fetcher })).toEqual({ ok: false, error: "redirect" });
    expect(calls).toEqual(["https://luma.com/abc"]);
  });

  test("stops after too many redirects", async () => {
    const { fetcher } = fakeFetch({
      "https://luma.com/aa": () => new Response(null, { status: 302, headers: { location: "/bb" } }),
      "https://luma.com/bb": () => new Response(null, { status: 302, headers: { location: "/aa" } }),
    });
    expect(await fetchLumaPage("https://luma.com/aa", { fetcher })).toEqual({ ok: false, error: "redirect" });
  });

  test("404, blocked, not HTML, too big and slow pages fail cleanly", async () => {
    const one = (r: () => Response) => fakeFetch({ "https://luma.com/abc": r }).fetcher;
    expect(await fetchLumaPage("luma.com/abc", { fetcher: one(() => new Response("", { status: 404 })) })).toEqual({ ok: false, error: "not_found" });
    expect(await fetchLumaPage("luma.com/abc", { fetcher: one(() => new Response("", { status: 403 })) })).toEqual({ ok: false, error: "blocked" });
    expect(await fetchLumaPage("luma.com/abc", { fetcher: one(() => new Response("{}", { headers: { "content-type": "application/json" } })) })).toEqual({ ok: false, error: "failed" });
    expect(await fetchLumaPage("luma.com/abc", { fetcher: one(() => html("x".repeat(5000))), maxBytes: 1000 })).toEqual({ ok: false, error: "too_large" });
    expect(await fetchLumaPage("luma.com/abc", { fetcher: one(() => html("x", { "content-length": "99999999" })) })).toEqual({ ok: false, error: "too_large" });
    const slow = async (_url: string, init: RequestInit) =>
      new Promise<Response>((_, reject) => init.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
    expect(await fetchLumaPage("luma.com/abc", { fetcher: slow, timeoutMs: 50 })).toEqual({ ok: false, error: "timeout" });
    expect(await fetchLumaPage("https://evil.example/abc", { fetcher: one(() => html("")) })).toEqual({ ok: false, error: "bad_url" });
  });

  test("reads the event from the page's JSON-LD and fills a draft in Israel time", () => {
    const ev = parseLumaHtml(LUMA_HTML, "https://luma.com/tau-ai-agents")!;
    expect(ev).toMatchObject({
      title: "סוכני AI בעולם האמיתי",
      starts_at: "2027-01-13T18:00:00.000+02:00",
      venue_name: "אולם ברודקום",
      image_url: expect.stringContaining("/uploads/aa/sample-cover.jpg"),
    });
    const d = lumaToDraft(ev, SPEAKERS, VENUES);
    expect(d).toMatchObject({
      source: "luma",
      title_he: "סוכני AI בעולם האמיתי",
      title_en: "",
      date: "2027-01-13",
      start_time: "18:00",
      end_time: "20:00",
      venue_id: VENUES[0].id,
      luma_url: "https://luma.com/tau-ai-agents",
    });
    expect(d.speakers.map((s) => s.id)).toEqual([SPEAKERS[2].id, SPEAKERS[0].id]);
    expect(d.blurb_he).toContain("איך בונים סוכן");
    expect(d.blurb_he).not.toContain("🗓");
    expect(d.filled).toEqual(expect.arrayContaining(["title_he", "date", "start_time", "end_time", "venue", "speakers", "luma_url"]));
  });

  test("summer time, OG-only pages and pages with no event", () => {
    const ld = (o: object) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`;
    const ev = parseLumaHtml(ld({ "@graph": [{ "@type": "Event", name: "Demo night", startDate: "2027-05-05T15:00:00Z", endDate: "2027-05-05T17:30:00Z" }] }), "https://luma.com/x1")!;
    expect(lumaToDraft(ev, [], [])).toMatchObject({ title_en: "Demo night", date: "2027-05-05", start_time: "18:00", end_time: "20:30" });
    const og = parseLumaHtml(`<meta property="og:title" content="Builders &amp; Coffee · Luma">`, "https://luma.com/x2")!;
    expect(og).toMatchObject({ title: "Builders & Coffee", starts_at: "" });
    expect(parseLumaHtml("<html><body>nothing</body></html>", "https://luma.com/x3")).toBeNull();
    expect(parseLumaHtml(ld({ "@type": "Event", name: "x", image: "https://evil.example/a.png" }), "https://luma.com/x4")!.image_url).toBe("");
  });
});

test.describe("flyer text parsing", () => {
  const line = (text: string, height = 40, confidence = 90): OcrLine => ({ text, height, confidence });

  test("dates in the formats flyers use", () => {
    const one = (s: string) => findDates(s, TODAY).map((d) => d.dates[0]);
    expect(one("Wed 18/11")).toEqual(["2026-11-18"]);
    expect(one("11.11")).toEqual(["2026-11-11"]); // five days ago: still this year
    expect(one("13 בינואר")).toEqual(["2027-01-13"]);
    expect(one("13 ינואר 2027")).toEqual(["2027-01-13"]);
    expect(one("January 13th")).toEqual(["2027-01-13"]);
    expect(one("Jan 13, 2027")).toEqual(["2027-01-13"]);
    expect(one("13.01.27")).toEqual(["2027-01-13"]);
    expect(one("18.00 19:30 32.13")).toEqual([]); // times and nonsense are not dates
  });

  test("times: ranges in either order, dots only for round quarters, dates not mistaken for times", () => {
    expect(findTimes("18:00-20:00", [])).toEqual({ start: "18:00", end: "20:00" });
    expect(findTimes("20:00–18:00", [])).toEqual({ start: "18:00", end: "20:00" });
    expect(findTimes("בשעה 18.30", [])).toEqual({ start: "18:30", end: "" });
    expect(findTimes("Doors 20:00 · Talk 20:30", [])).toEqual({ start: "20:00", end: "" });
    const text = "17.11 at 19:00";
    expect(findTimes(text, findDates(text, TODAY))).toEqual({ start: "19:00", end: "" });
  });

  test("a flyer's lines become a draft: confident fields filled, titles only suggested", () => {
    const d = parseFlyerText(
      [
        line("TAU AI CLUB · COHORT 02", 20),
        line("סוכני AI", 90, 96),
        line("בעולם האמיתי", 90, 95),
        line("AI agents in the real world", 44),
        line("עם אורי גושן ושייהל", 37), // OCR glued "ושי יהל"
        line("יום רביעי, 01.13 · 20:00-18:00", 34), // OCR swapped the date's digit groups
        line("אולם ברודקום, אוניברסיטת תל אביב", 41),
        line("הרשמה: lu.ma/ tau-ai-agents", 37),
      ],
      SPEAKERS,
      VENUES,
      TODAY,
    );
    expect(d).toMatchObject({
      date: "2027-01-13", // the printed weekday (Wednesday) picks the right reading
      start_time: "18:00",
      end_time: "20:00",
      venue_id: VENUES[0].id,
      luma_url: "https://lu.ma/tau-ai-agents",
      title_he: "",
      title_en: "",
    });
    expect(d.speakers.map((s) => s.id)).toEqual([SPEAKERS[2].id, SPEAKERS[0].id]);
    expect(d.hints.filter((h) => h.what === "title").map((h) => h.text)).toEqual(expect.arrayContaining(["סוכני AI", "בעולם האמיתי"]));
  });

  test("unsure things stay out of the form", () => {
    // A weekday that matches neither reading of an ambiguous date: no date, only hints.
    const d = parseFlyerText([line("Tuesday 05.06"), line("Room 101, Gilman building")], SPEAKERS, VENUES, TODAY);
    expect(d.date).toBe("");
    expect(d.hints.filter((h) => h.what === "date").length).toBeGreaterThan(0);
    // An unknown venue is a hint, not a venue; a short name like "Oz" inside a word is not a speaker.
    expect(d.venue_id).toBeNull();
    expect(d.hints).toContainEqual({ what: "venue", text: "Room 101, Gilman building" });
    expect(parseFlyerText([line("Ozempic and the brain")], SPEAKERS, VENUES, TODAY).speakers).toEqual([]);
    // Low-confidence lines are not even suggested as titles.
    expect(parseFlyerText([line("ש ו ה ו נ ב ב", 120, 20)], SPEAKERS, VENUES, TODAY).hints).toEqual([]);
  });
});

test.describe("prefill and matching", () => {
  test("missing times default to 18:00–20:00 Israel time", () => {
    expect(wallTimes("2027-01-13", "", "")).toEqual({ starts_at: "2027-01-13T18:00", ends_at: "2027-01-13T20:00" });
    expect(wallTimes("2027-01-13", "17:30", "")).toEqual({ starts_at: "2027-01-13T17:30", ends_at: "2027-01-13T19:30" });
    expect(wallTimes("", "18:00", "20:00")).toEqual({ starts_at: "", ends_at: "" });
  });

  test("the prefill round-trips Hebrew and the imported-field marks, and drops anything malformed", () => {
    const p: EventPrefill = {
      title_he: "מבוא לסוכני AI", title_en: "Intro", slug: "intro", kind: "lecture", series: "zero-to-hero",
      series_no: 3, blurb_he: "", blurb_en: "", starts_at: "2027-01-13T18:00", ends_at: "2027-01-13T20:00",
      venue_id: "", venue_note_he: "חדר 006", venue_note_en: "", luma_url: "https://luma.com/x",
      speaker_ids: ["00000000-0000-4000-8000-000000000001"], notes: "", filled: ["title_he", "starts_at", "luma_url"],
    };
    expect(decodePrefill(encodePrefill(p))).toEqual(p);
    expect(decodePrefill("not-base64!!")).toBeNull();
    const bad = decodePrefill(
      encodePrefill({ ...p, slug: "<script>", starts_at: "tomorrow", speaker_ids: ["x"], luma_url: "javascript:alert(1)", filled: ["title_he", "status", "<img>"] }),
    );
    expect(bad).toMatchObject({ slug: "script", starts_at: "", speaker_ids: [], luma_url: "", filled: ["title_he"] });
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
    expect(findSpeakersInText("הרצאה של דנה לוי ועוז", speakers).map((s) => s.id)).toEqual(["a", "b"]);
    expect(matchVenue("בניין שרייבר, חדר 006", [{ id: "v", name_he: "בניין שרייבר", name_en: "Schreiber Building" }])?.id).toBe("v");
    expect(matchVenue("Broadcom Hall", [{ id: "v", name_he: "בניין שרייבר", name_en: "Schreiber Building" }])).toBeNull();
    expect(normalizeName("  Prof. Ada   LOVELACE ")).toBe("ada lovelace");
    expect(slugify("Intro to AI agents!")).toBe("intro-to-ai-agents");
  });
});

test.describe("people on a flyer: the caption next to each face", () => {
  const line = (text: string, y: number, height = 30, region: CaptionLine["region"] = "below", confidence = 85): CaptionLine => ({ text, y, height, region, confidence });

  test("mixed Hebrew/English lines get their runs back in reading order", () => {
    expect(fixMixedRuns("AI, Example Labs חוקרת")).toBe("חוקרת AI, Example Labs");
    expect(fixMixedRuns("AI סוכני")).toBe("סוכני AI");
    expect(fixMixedRuns("CTO @ Sample AI")).toBe("CTO @ Sample AI");
    expect(fixMixedRuns("תמר לוי")).toBe("תמר לוי");
  });

  test("chips: each line and its parts, junk and far-away text left out", () => {
    const chips = captionChips([
      line("~~ |", 0, 12, "below", 30),
      line("Daniel Mor", 20, 34),
      line("CTO @ Sample AI", 62, 22),
      line("lu.ma/agents-night", 400, 22), // far below the caption: another part of the flyer
      line("CTO", 10, 20, "left"),
    ]);
    expect(chips).toEqual(["Daniel Mor", "CTO @ Sample AI", "CTO", "Sample AI"]);
  });

  test("a name that is already a speaker links to them; the next line gives role and company", () => {
    const g = guessPerson([line("AI, Example Labs חוקרת", 60, 22), line("תמרלוי", 20, 34)], [{ id: "t", name_he: "תמר לוי", name_en: "Tamar Levi" }]);
    expect(g).toMatchObject({ speakerId: "t", name_he: "תמר לוי", name_en: "Tamar Levi", role_he: "חוקרת AI", company_en: "Example Labs" });
  });

  test("an unknown name prefills a new speaker; the biggest line is the name, not stray marks", () => {
    const g = guessPerson([line("SE enn", 0, 14), line("נועה ברק", 20, 36), line("מהנדסת מחקר +Example Labs", 64, 22)], SPEAKERS);
    expect(g).toMatchObject({ speakerId: null, name_he: "נועה ברק", role_he: "מהנדסת מחקר", company_en: "Example Labs" });
    const en = guessPerson([line("Dana Cohen", 0, 34), line("Head of Research | Acme Labs", 40, 22)], SPEAKERS);
    expect(en).toMatchObject({ speakerId: null, name_en: "Dana Cohen", role_en: "Head of Research", company_en: "Acme Labs" });
    // A link or a date is never taken as a name.
    expect(guessPerson([line("הרשמה: lu.ma/x", 0, 30), line("17.03", 40, 30)], SPEAKERS)).toMatchObject({ name_he: "", name_en: "" });
  });
});

test.describe("import as an admin", () => {
  test.skip(!process.env.E2E_ADMIN_STATE, "needs E2E_ADMIN_STATE (admin storageState) and a dev Supabase");
  test.use({ storageState: process.env.E2E_ADMIN_STATE });

  test("Luma link → review → form filled as a draft, imported fields marked", async ({ page }) => {
    // The server's Luma fetch is covered above with a mocked Luma; here the panel gets the parsed fixture.
    const event = parseLumaHtml(LUMA_HTML, "https://luma.com/tau-ai-agents");
    await page.route("**/api/admin/luma", (r) => r.fulfill({ json: { ok: true, event: { ...event, image_url: "" } } }));
    await page.goto("/en/admin/events/new");
    await page.getByTestId("luma-url").fill("https://luma.com/tau-ai-agents");
    await page.getByTestId("luma-import").click();
    const review = page.getByTestId("flyer-review");
    await expect(review).toContainText("סוכני AI בעולם האמיתי");
    await expect(review).toContainText("18:00–20:00");
    // Leave every speaker out so the test creates no rows.
    for (const select of await page.getByTestId("flyer-speaker-choice").all()) await select.selectOption("skip");
    await page.getByTestId("flyer-apply").click();
    await expect(page).toHaveURL(/\/en\/admin\/events\/new\?prefill=/);
    await expect(page.getByTestId("flyer-prefilled")).toBeVisible();
    await expect(page.locator('input[name="title_he"]')).toHaveValue("סוכני AI בעולם האמיתי");
    await expect(page.locator('input[name="starts_at"]')).toHaveValue("2027-01-13T18:00");
    await expect(page.locator('input[name="ends_at"]')).toHaveValue("2027-01-13T20:00");
    await expect(page.locator('input[name="luma_url"]')).toHaveValue("https://luma.com/tau-ai-agents");
    await expect(page.locator('select[name="status"]')).toHaveValue("draft");
    expect(await page.getByTestId("imported-tag").count()).toBeGreaterThanOrEqual(4);
  });

  test("flyer image → read in the browser → date, time, venue and link filled", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/en/admin/events/new");
    await page.getByTestId("flyer-file").setInputFiles(path.join(__dirname, "fixtures", "flyer-he.png"));
    await page.getByTestId("flyer-read").click();
    const review = page.getByTestId("flyer-review");
    await expect(review).toBeVisible({ timeout: 90_000 });
    await expect(review).toContainText("lu.ma/tau-ai-agents");
    for (const select of await page.getByTestId("flyer-speaker-choice").all()) await select.selectOption("skip");
    await page.getByTestId("flyer-apply").click();
    await expect(page.locator('input[name="luma_url"]')).toHaveValue("https://lu.ma/tau-ai-agents");
    await expect(page.locator('select[name="status"]')).toHaveValue("draft");
  });

  test("two-speaker flyer → one card per face, with its photo and the text beside it", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/en/admin/events/new");
    await page.getByTestId("flyer-file").setInputFiles(path.join(__dirname, "fixtures", "flyer-two-speakers.png"));
    await page.getByTestId("flyer-read").click();
    await expect(page.getByTestId("flyer-review")).toBeVisible({ timeout: 90_000 });
    const cards = page.getByTestId("flyer-speaker");
    expect(await cards.count()).toBeGreaterThanOrEqual(2);
    await expect(cards.getByTestId("person-face")).toHaveCount(2);
    await expect(page.getByTestId("person-chips").first()).toBeVisible();
    // A chip tapped as a name goes to the right language field of a new speaker.
    const card = cards.filter({ hasText: "Example Labs" }).first();
    await card.getByTestId("flyer-speaker-choice").selectOption("new");
    await card.getByTestId("person-chip").filter({ hasText: "Example Labs" }).first().locator("..").getByTestId("chip-company").click();
    await expect(card.getByTestId("flyer-company-en")).toHaveValue(/Example Labs/);
  });

  test("speaker editor: From a flyer fills name, role, company and photo; nothing saved", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/en/admin/speaker-profiles");
    const panel = page.getByTestId("speaker-flyer").first();
    await panel.locator("summary").click();
    await panel.getByTestId("speaker-flyer-file").setInputFiles(path.join(__dirname, "fixtures", "flyer-he-speaker.png"));
    await panel.getByTestId("speaker-flyer-read").click();
    await expect(panel.getByTestId("speaker-flyer-person")).toHaveCount(1, { timeout: 90_000 });
    await panel.getByTestId("speaker-flyer-use").click();
    const form = page.locator("form").filter({ has: panel });
    await expect(form.locator('input[name="photo_url"]')).toHaveValue(/^https:\/\/.+\.supabase\.co\/storage\/v1\/object\/public\/speaker-photos\/profiles\//);
    await expect(form.locator('input[name="name_he"]')).not.toHaveValue("");
  });
});
