import { test, expect, type APIRequestContext } from "@playwright/test";
import fixtures from "../../src/lib/data/fixtures.json";

/**
 * M2 guest-level page checks + leak scans (TEST-PLAN section 2). Everything here runs as a guest.
 * The scans are value-agnostic: they look for ANY email / phone / LinkedIn profile URL / contact-table name, so
 * they keep working once real speaker data exists in the database.
 */
const SLUGS = [
  "cohort-02-opening",
  "zero-to-hero-1",
  "zero-to-hero-2",
  "entrepreneurship-tech-or-maccabi",
  "zero-to-hero-3",
  "entrepreneurship-tech-roee-margalit",
  "growth-capital-tomer-diari",
  "joint-event-ori-goshen",
  "cohort-02-closing",
];
const PUBLIC_PATHS = [
  "/",
  "/en",
  "/login",
  "/en/login",
  "/members-only",
  "/en/members-only",
  ...SLUGS.flatMap((s) => [`/events/${s}`, `/en/events/${s}`]),
  "/calendar.ics",
  "/calendar-en.ics",
  "/sitemap.xml",
  "/robots.txt",
];

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const PHONE = /(?<![\w.-])(\+?972|0)[-\s]?([23489]|5\d|7\d)[-\s]?\d{3}[-\s]?\d{4}(?![\w])/g;
// "linkedin.com/in/your-name" is the speaker form's placeholder hint (ships in the shared messages bundle), not data.
const LINKEDIN_PERSON = /linkedin\.com\/(?:in|pub)\/(?!your-name)[A-Za-z0-9_%-]+/gi;
// Public profile columns (speakers.linkedin_url and the founders' club_team.linkedin_url, confirmed
// by the club) are shown on purpose. Anything else (a private LinkedIn from speaker_contacts) is a leak.
const PUBLIC_LINKEDIN = new Set(
  [
    ...(fixtures.events as { event_speakers: { speaker: { linkedin_url: string | null } }[] }[]).flatMap((e) =>
      e.event_speakers.map((es) => es.speaker.linkedin_url),
    ),
    ...((fixtures as { team?: { linkedin_url: string | null }[] }).team ?? []).map((m) => m.linkedin_url),
  ]
    .filter((u): u is string => Boolean(u))
    .map((u) => /linkedin\.com\/(?:in|pub)\/[A-Za-z0-9_%-]+/i.exec(u)?.[0].toLowerCase()),
);
const TABLE_NAMES = /speaker_contacts|speaker_form_tokens|member_speaker_contact|share_email|share_phone|linkedin_public|service_role/g;

function scan(text: string) {
  const t = text.replace(/^UID:.*$/gm, ""); // iCal UID: <uuid>@tau-ai-club
  return {
    emails: (t.match(EMAIL) ?? []).filter((e) => !/\.(png|jpe?g|webp|svg|gif|woff2?|css|js)$/i.test(e)),
    phones: t.match(PHONE) ?? [],
    linkedin: (t.match(LINKEDIN_PERSON) ?? []).filter((u) => !PUBLIC_LINKEDIN.has(u.toLowerCase())),
    tables: t.match(TABLE_NAMES) ?? [],
  };
}

async function get(request: APIRequestContext, path: string) {
  return request.get(path, { maxRedirects: 0 });
}

test("guest-reachable routes contain no contact data (HTML, source, meta, feeds)", async ({ request }) => {
  for (const p of PUBLIC_PATHS) {
    const r = await get(request, p);
    expect(r.status(), p).toBeLessThan(400);
    const body = await r.text();
    const s = scan(body);
    expect(s.emails, `${p}: email addresses`).toEqual([]);
    expect(s.phones, `${p}: phone numbers`).toEqual([]);
    expect(s.linkedin, `${p}: LinkedIn profile links`).toEqual([]);
    expect(s.tables, `${p}: contact table/field names`).toEqual([]);
    expect(body, `${p}: mailto/tel`).not.toMatch(/(mailto|tel):/i);
  }
});

test("OG / meta / JSON-LD tags carry no contact data", async ({ page }) => {
  for (const p of ["/", "/en", `/events/${SLUGS[1]}`, `/en/events/${SLUGS[7]}`, "/members-only", "/login"]) {
    await page.goto(p);
    const meta = await page.evaluate(() =>
      [...document.querySelectorAll("head meta, head link, head script[type='application/ld+json']")].map((e) => e.outerHTML).join("\n"),
    );
    const s = scan(meta);
    expect(s.emails, p).toEqual([]);
    expect(s.phones, p).toEqual([]);
    expect(s.linkedin, p).toEqual([]);
    expect(s.tables, p).toEqual([]);
  }
});

test("client JS bundles never reference contact tables, RPC names or the service key", async ({ page }) => {
  const seen = new Set<string>();
  page.on("response", (r) => {
    if (/\/_next\/static\/.*\.js/.test(r.url())) seen.add(r.url());
  });
  for (const p of ["/", "/en", "/en/login", "/en/members-only", `/en/events/${SLUGS[1]}`, `/en/speaker/${"a".repeat(64)}`]) {
    await page.goto(p);
    await page.waitForLoadState("networkidle");
  }
  expect(seen.size).toBeGreaterThan(0);
  for (const url of seen) {
    const js = await (await page.request.get(url)).text();
    const hits = js.match(/speaker_contacts|speaker_form_tokens|member_speaker_contact|admin_speaker_contact_status|service_role|SUPABASE_SERVICE/g) ?? [];
    expect(hits, url).toEqual([]);
  }
});

test("/members-only shows the closed-club text in both languages, no join flow", async ({ request, page }) => {
  await page.goto("/members-only");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByTestId("members-only")).toContainText("המועדון סגור לחברים בלבד");
  await expect(page.getByTestId("members-only")).toContainText("חברי המועדון נכנסים עם Google");
  await page.goto("/en/members-only");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(page.getByTestId("members-only")).toContainText("Members only");
  await expect(page.getByTestId("members-only")).toContainText("Club members sign in with Google");
  for (const p of ["/members-only", "/en/members-only"]) {
    const html = await (await request.get(p)).text();
    expect(html).toMatch(/noindex/);
    expect(html.replace(/<script[\s\S]*?<\/script>/g, "")).not.toMatch(/request to join|join request|בקשת הצטרפות/i);
  }
});

test("admin routes refuse guests (redirect to sign-in, never admin content)", async ({ request }) => {
  for (const p of ["/admin", "/admin/members", "/admin/speakers", "/en/admin", "/en/admin/members", "/en/admin/speakers"]) {
    let r = await get(request, p);
    // /admin itself redirects to /admin/members; follow internal hops (max 3) to the final answer.
    for (let hop = 0; hop < 3 && [303, 307, 308].includes(r.status()) && /^\/(en\/)?admin/.test(r.headers()["location"] ?? ""); hop++) {
      r = await get(request, r.headers()["location"]!);
    }
    const body = await r.text();
    const loc = r.headers()["location"] ?? "";
    const refused = ([303, 307, 308].includes(r.status()) && /\/login|\/members-only/.test(loc)) || r.status() === 404 || r.status() === 403;
    expect(refused, `${p} -> ${r.status()} ${loc}`).toBe(true);
    expect(body, `${p} leaked admin UI`).not.toMatch(/admin_add_member|admin_import|admin-tabs|speaker-contact-status/i);
    expect(r.headers()["cache-control"] ?? "", p).not.toMatch(/public|s-maxage/);
  }
});

test("welcome and speaker-form pages: noindex, not publicly cacheable, invalid tokens show no form", async ({ request }) => {
  const w = await get(request, "/en/welcome");
  expect([303, 307]).toContain(w.status());
  expect(w.headers()["cache-control"] ?? "").not.toMatch(/public|s-maxage/);
  for (const tok of ["abc", "0".repeat(64), "A".repeat(64), "../../etc/passwd", "x'%20or%201=1"]) {
    for (const prefix of ["", "/en"]) {
      const r = await get(request, `${prefix}/speaker/${encodeURIComponent(tok)}`);
      const body = await r.text();
      expect(r.status(), tok).toBeLessThan(500);
      expect(body, `${tok}: form shown for an invalid token`).not.toMatch(/data-testid="speaker-form"/);
      expect(body, tok).toMatch(/noindex/);
      expect(r.headers()["cache-control"] ?? "", tok).not.toMatch(/s-maxage|public/);
      if (r.status() === 200) expect(body, tok).toMatch(/no-referrer/); // 404s from the catch-all have no form to protect
    }
  }
});

test("auth API endpoints block open redirects", async ({ request }) => {
  for (const evil of ["//evil.example", "https://evil.example", "/\\evil.example"]) {
    const r = await get(request, `/api/auth/signin?next=${encodeURIComponent(evil)}`);
    expect(r.headers()["location"] ?? "", evil).not.toMatch(/evil\.example/);
  }
  const cb = await get(request, "/api/auth/callback?code=bogus&next=https://evil.example");
  expect(cb.headers()["location"] ?? "").not.toMatch(/evil\.example/);
});

test("sign-in page offers Google sign-in in both languages", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByText(/Google/).first()).toBeVisible();
  await page.goto("/en/login");
  await expect(page.getByText("Sign in with Google").first()).toBeVisible();
});
