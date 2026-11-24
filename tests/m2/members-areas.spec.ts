import { test, expect, type APIRequestContext } from "@playwright/test";

/**
 * M2 part 2 (profiles, admin editors, members-only speaker contact links), guest level.
 * Run twice: plain, and with PW_M2_FAKE_SUPABASE=1 so the auth code paths execute (garbage cookies).
 * Member-rendered output (the contact links themselves) needs a real Supabase session: not covered here.
 */
const UUID = "123e4567-e89b-42d3-a456-426614174000";
const get = (request: APIRequestContext, path: string, headers?: Record<string, string>) =>
  request.get(path, { maxRedirects: 0, headers });

async function finalAnswer(request: APIRequestContext, path: string) {
  let r = await get(request, path);
  for (let hop = 0; hop < 3 && [303, 307, 308].includes(r.status()) && /^\/(en\/)?admin/.test(r.headers()["location"] ?? ""); hop++) {
    r = await get(request, r.headers()["location"]!);
  }
  return r;
}

const GUARDED = [
  "/profile",
  `/members/${UUID}`,
  "/admin/events",
  `/admin/events/${UUID}`,
  "/admin/events/new",
  "/admin/venues",
  "/admin/speaker-profiles",
];

for (const prefix of ["", "/en"]) {
  test(`guests are refused on members/admin pages [${prefix || "he"}]`, async ({ request }) => {
    for (const p of GUARDED) {
      const r = await finalAnswer(request, prefix + p);
      const loc = r.headers()["location"] ?? "";
      const refused = ([303, 307, 308].includes(r.status()) && /\/login|\/members-only/.test(loc)) || [403, 404].includes(r.status());
      expect(refused, `${prefix}${p} -> ${r.status()} ${loc}`).toBe(true);
      const body = await r.text();
      expect(body, `${prefix}${p} leaked UI`).not.toMatch(/admin_save_event|member_directory|member_profile|update_my_name|data-testid="(profile|admin)/i);
      expect(r.headers()["cache-control"] ?? "", p).not.toMatch(/public|s-maxage/);
    }
  });
}

test("contact endpoint answers guests with an empty, uncacheable response", async ({ request }) => {
  const slugs = ["zero-to-hero-1", "joint-event-ori-goshen", "does-not-exist", "UPPER", "a".repeat(200), "x%27%20or%201=1"];
  for (const slug of slugs) {
    const r = await get(request, `/api/events/${slug}/speaker-contacts`);
    expect(r.status(), slug).toBeLessThan(500);
    if (r.status() === 200) {
      expect(await r.json(), slug).toEqual({ contacts: {} });
      const cc = r.headers()["cache-control"] ?? "";
      expect(cc, slug).toMatch(/no-store/);
      expect(cc, slug).toMatch(/private/);
      expect(r.headers()["vary"] ?? "", slug).toMatch(/cookie/i);
      expect(r.headers()["access-control-allow-origin"] ?? "", slug).not.toBe("*");
    }
  }
});

test("contact endpoint with a garbage session cookie returns nothing and does not 500", async ({ request }) => {
  for (const cookie of ["sb-127-auth-token=base64-garbage", "sb-x-auth-token=eyJhbGciOiJub25lIn0.eyJzdWIiOiIxIiwicm9sZSI6ImF1dGhlbnRpY2F0ZWQifQ.", "sb-x-auth-token.0=abc; sb-x-auth-token.1=def"]) {
    const r = await get(request, "/api/events/zero-to-hero-1/speaker-contacts", { cookie });
    expect(r.status(), cookie).toBeLessThan(500);
    const text = await r.text();
    expect(text, cookie).not.toMatch(/mailto|@|\+972|linkedin/i);
    expect(JSON.parse(text), cookie).toEqual({ contacts: {} });
    expect(r.headers()["cache-control"] ?? "", cookie).toMatch(/no-store/);
  }
});

test("a forged unsigned JWT cannot make the endpoint reveal contacts", async ({ request }) => {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const jwt = `${b64({ alg: "none", typ: "JWT" })}.${b64({ sub: UUID, role: "authenticated", email: "admin@tau.test", exp: 4102444800 })}.`;
  const session = "base64-" + Buffer.from(JSON.stringify({ access_token: jwt, refresh_token: "x", token_type: "bearer", expires_in: 3600, expires_at: 4102444800 })).toString("base64url");
  const r = await get(request, "/api/events/zero-to-hero-1/speaker-contacts", { cookie: `sb-127-auth-token=${session}` });
  expect(r.status()).toBeLessThan(500);
  expect(await r.json()).toEqual({ contacts: {} });
  // Follow the redirects by hand (a guest may be forwarded more than once: /profile -> /me -> login, /admin -> login).
  // Every path must end at login / members-only or a 404, never on a page with content.
  for (const p of ["/admin/members", "/en/profile"]) {
    let url = p;
    const trail: string[] = [];
    let end = "";
    for (let hop = 0; hop < 5; hop++) {
      const pr = await get(request, url, { cookie: `sb-127-auth-token=${session}` });
      const loc = pr.headers()["location"] ?? "";
      trail.push(`${url} -> ${pr.status()} ${loc}`);
      if (pr.status() === 404) { end = "404"; break; }
      expect([303, 307, 308].includes(pr.status()), trail.join(" | ")).toBe(true);
      if (/\/login|\/members-only/.test(loc)) { end = "login"; break; }
      url = loc;
    }
    expect(end, trail.join(" | ")).not.toBe("");
  }
});

test("event pages ship no contact links or contact values in HTML, bundle names or OG tags", async ({ request, page }) => {
  for (const slug of ["zero-to-hero-1", "growth-capital-tomer-diari", "joint-event-ori-goshen", "entrepreneurship-tech-or-maccabi"]) {
    for (const prefix of ["", "/en"]) {
      const html = await (await request.get(`${prefix}/events/${slug}`)).text();
      expect(html, `${prefix}/${slug}`).not.toMatch(/data-testid="speaker-contact"|mailto:|tel:/i);
      expect(html, `${prefix}/${slug}`).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/);
    }
  }
  // After hydration, a guest still gets no contact block in the DOM.
  await page.goto("/en/events/zero-to-hero-1");
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("speaker-contact")).toHaveCount(0);
  expect(await page.content()).not.toMatch(/mailto:|tel:/i);
  // The calendar feeds carry no contact lines either (also covered in pages.spec.ts for every route).
  for (const f of ["/calendar.ics", "/calendar-en.ics"]) {
    const ics = (await (await request.get(f)).text()).replace(/^UID:.*$/gm, "");
    expect(ics, f).not.toMatch(/mailto:|tel:|ATTENDEE|ORGANIZER|[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/);
  }
});

test("merged admin: /admin/speakers is only a guarded redirect; contact status lives on the event page", async ({ request }) => {
  for (const prefix of ["", "/en"]) {
    // A guest must be sent to sign-in FIRST, not bounced to /admin/events (which would expose that the page exists).
    const r = await get(request, `${prefix}/admin/speakers`);
    expect([303, 307, 308].includes(r.status()), `${prefix}/admin/speakers -> ${r.status()}`).toBe(true);
    expect(r.headers()["location"] ?? "", prefix).toMatch(/\/login|\/members-only/);
    // The event editor and the events list refuse guests too and carry no contact-status data.
    for (const p of ["/admin/events", `/admin/events/${UUID}`]) {
      const e = await finalAnswer(request, prefix + p);
      expect([303, 307, 308, 403, 404], `${prefix}${p}`).toContain(e.status());
      const body = await e.text();
      expect(body, p).not.toMatch(/admin_speaker_contact_status|has_email|has_phone|link_expires_at|speaker-contacts-panel/i);
    }
  }
});

test("guest bundles and HTML do not contain the admin contact panel", async ({ page, request }) => {
  const seen = new Set<string>();
  page.on("response", (r) => {
    if (/\/_next\/static\/.*\.js/.test(r.url())) seen.add(r.url());
  });
  for (const p of ["/", "/en", "/en/events/zero-to-hero-1", "/en/login", "/en/members-only"]) {
    await page.goto(p);
    await page.waitForLoadState("networkidle");
  }
  for (const url of seen) {
    const js = await (await request.get(url)).text();
    expect(js.match(/admin_speaker_contact_status|speaker-contacts-panel|SpeakerContactsPanel|admin_revoke_speaker_tokens|admin_delete_speaker_contact|admin_create_speaker_token/g) ?? [], url).toEqual([]);
  }
});
