import { expect, test } from "@playwright/test";

/**
 * Email + 6-digit code log-in, as a guest, with the members area on and an unreachable Supabase
 * (see playwright.m2.config.ts). No code is ever really sent here; this checks the routes'
 * behaviour: same answer for every email (no member enumeration), the email never in a URL,
 * same-origin only, throttling, safe `next`, and the members' area pages refusing guests.
 * Real delivery and verification need the dev Supabase (qa/TEST-PLAN.md).
 */

// Each project/run gets its own addresses: the throttle is per email and per server.
// All requests come from localhost, so each gets its own client IP: the per-IP throttle would
// otherwise trip across tests (the per-email limit is what the throttle test checks).
const fakeIp = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
const uniq = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

test.describe("POST /api/auth/otp (request a code)", () => {
  test("the same neutral answer for any valid email; the email is never in the URL", async ({ request, baseURL }) => {
    const origin = new URL(baseURL!).origin;
    const a = `listed-maybe-${uniq()}@club.test`;
    const b = `stranger-${uniq()}@gmail.test`;
    const locs: string[] = [];
    for (const email of [a, b]) {
      const r = await request.post("/api/auth/otp", { form: { email, locale: "en", next: "/workshops" }, maxRedirects: 0, headers: { origin, "x-forwarded-for": fakeIp() } });
      expect(r.status()).toBe(303);
      const loc = r.headers()["location"] ?? "";
      expect(loc).toMatch(/\/en\/login\?sent=1&next=%2Fworkshops$/);
      expect(decodeURIComponent(loc)).not.toContain("@");
      const cookie = r.headers()["set-cookie"] ?? "";
      expect(cookie).toMatch(/tau_otp_email=/);
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/Path=\/api\/auth/i);
      expect(r.headers()["cache-control"] ?? "").toMatch(/no-store/);
      locs.push(loc);
    }
    expect(locs[0]).toBe(locs[1]);
  });

  test("the code screen shows the neutral message in both languages", async ({ page }) => {
    await page.goto("/en/login?sent=1");
    await expect(page.getByTestId("code-sent")).toHaveText(
      "If this email is on the club list, a code is on its way. Didn't get one? Contact the club.",
    );
    await expect(page.getByLabel("6-digit code")).toHaveAttribute("autocomplete", "one-time-code");
    await page.goto("/login?sent=1");
    await expect(page.getByTestId("code-sent")).toHaveText("אם המייל הזה ברשימת המועדון, קוד כבר בדרך. לא הגיע? צרו קשר עם המועדון.");
  });

  test("an invalid email is refused without sending anything", async ({ request, baseURL }) => {
    const origin = new URL(baseURL!).origin;
    for (const email of ["", "not-an-email", "a@b", `${"x".repeat(250)}@club.test`]) {
      const r = await request.post("/api/auth/otp", { form: { email, locale: "en" }, maxRedirects: 0, headers: { origin, "x-forwarded-for": fakeIp() } });
      expect(r.status(), email).toBe(303);
      expect(r.headers()["location"] ?? "", email).toMatch(/\/en\/login\?error=email/);
      expect(r.headers()["set-cookie"] ?? "", email).not.toMatch(/tau_otp_email=/);
    }
  });

  test("cross-site posts are refused", async ({ request }) => {
    const r = await request.post("/api/auth/otp", { form: { email: `x-${uniq()}@club.test` }, maxRedirects: 0, headers: { origin: "https://evil.example" } });
    expect(r.status()).toBe(403);
    const v = await request.post("/api/auth/verify", { form: { code: "123456" }, maxRedirects: 0, headers: { origin: "https://evil.example" } });
    expect(v.status()).toBe(403);
  });

  test("a fourth request for the same email within minutes is throttled", async ({ request, baseURL }) => {
    const origin = new URL(baseURL!).origin;
    const email = `throttle-${uniq()}@club.test`;
    const answers: string[] = [];
    for (let i = 0; i < 4; i++) {
      const r = await request.post("/api/auth/otp", { form: { email, locale: "en" }, maxRedirects: 0, headers: { origin, "x-forwarded-for": fakeIp() } });
      answers.push(r.headers()["location"] ?? "");
    }
    expect(answers.slice(0, 3).every((l) => /sent=1/.test(l))).toBe(true);
    expect(answers[3]).toMatch(/error=throttled/);
  });

  test("next can't become an open redirect", async ({ request, baseURL }) => {
    const origin = new URL(baseURL!).origin;
    for (const evil of ["//evil.example", "https://evil.example", "/\\evil.example", "/api/auth/signout"]) {
      const r = await request.post("/api/auth/otp", { form: { email: `n-${uniq()}@club.test`, next: evil }, maxRedirects: 0, headers: { origin, "x-forwarded-for": fakeIp() } });
      const loc = r.headers()["location"] ?? "";
      expect(loc, evil).not.toMatch(/evil\.example/);
      expect(loc, evil).toMatch(/next=%2Fme$/);
    }
  });
});

test.describe("POST /api/auth/verify (enter the code)", () => {
  test("without the step-1 cookie: start over", async ({ request, baseURL }) => {
    const r = await request.post("/api/auth/verify", { form: { code: "123456", locale: "en" }, maxRedirects: 0, headers: { origin: new URL(baseURL!).origin, "x-forwarded-for": fakeIp() } });
    expect(r.status()).toBe(303);
    expect(r.headers()["location"] ?? "").toMatch(/\/en\/login\?error=expired/);
  });

  test("a malformed or wrong code stays on the code screen with an error, and no session", async ({ request, baseURL }) => {
    const origin = new URL(baseURL!).origin;
    await request.post("/api/auth/otp", { form: { email: `v-${uniq()}@club.test`, locale: "en" }, maxRedirects: 0, headers: { origin, "x-forwarded-for": fakeIp() } });
    for (const code of ["12", "abcdef", "123456"]) {
      const r = await request.post("/api/auth/verify", { form: { code, locale: "en" }, maxRedirects: 0, headers: { origin, "x-forwarded-for": fakeIp() } });
      expect(r.status(), code).toBe(303);
      expect(r.headers()["location"] ?? "", code).toMatch(/\/en\/login\?sent=1&error=code/);
      expect(r.headers()["set-cookie"] ?? "", code).not.toMatch(/sb-[^=]*-auth-token=[^;]/);
      expect(r.headers()["set-cookie"] ?? "", code).not.toMatch(/tau_member=1/);
    }
  });
});

test.describe("members' area pages refuse guests", () => {
  test("/me sends guests to log in and back", async ({ request }) => {
    for (const [p, next] of [
      ["/me", "%2Fme"],
      ["/en/me", "%2Fme"],
    ]) {
      const r = await request.get(p, { maxRedirects: 0 });
      expect([303, 307, 308], p).toContain(r.status());
      expect(r.headers()["location"] ?? "", p).toMatch(new RegExp(`/login\\?next=${next}$`));
      expect(await r.text(), p).not.toMatch(/data-testid="(me|me-upcoming|me-game-slot)"/);
    }
  });
});

test.describe("per-event calendar download", () => {
  test("one meetup as an .ics attachment, public fields only", async ({ request }) => {
    const r = await request.get("/api/calendar/zero-to-hero-1?locale=en");
    expect(r.status()).toBe(200);
    expect(r.headers()["content-type"]).toMatch(/text\/calendar/);
    expect(r.headers()["content-disposition"]).toMatch(/attachment; filename="tau-ai-club-zero-to-hero-1\.ics"/);
    const ics = await r.text();
    expect(ics.match(/BEGIN:VEVENT/g)?.length).toBe(1);
    expect(ics).toContain("UID:zero-to-hero-1@tau-ai-club");
    expect(ics).not.toMatch(/@gmail|mailto:|tel:/i);
    expect((await request.get("/api/calendar/no-such-event")).status()).toBe(404);
    expect((await request.get("/api/calendar/..%2F..%2Fetc")).status()).toBe(404);
  });
});
