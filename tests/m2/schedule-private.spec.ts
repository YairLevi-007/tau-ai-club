import { test, expect } from "@playwright/test";

// Members area on: the schedule (dates, times, places) is members only for now
// (docs/OPEN-QUESTIONS.md #1). Guests get the vision, speakers and founders.

test("guest home page shows no next meetup card, no season dial and no feed links", async ({ page }) => {
  for (const p of ["/", "/en"]) {
    await page.goto(p);
    await expect(page.getByTestId("season-speakers"), p).toBeVisible();
    await expect(page.getByTestId("next-event-card"), p).toHaveCount(0);
    await expect(page.getByTestId("season-timeline"), p).toHaveCount(0);
    await expect(page.getByTestId("season-subscribe"), p).toHaveCount(0);
    expect(await page.content(), p).not.toMatch(/href="\/(en\/)?events\/|calendar(-en)?\.ics|18:00/);
  }
});

test("guest meetup pages send you to sign in", async ({ request }) => {
  for (const p of ["/events/zero-to-hero-1", "/en/events/zero-to-hero-1"]) {
    const r = await request.get(p, { maxRedirects: 0 });
    expect([303, 307, 308], p).toContain(r.status());
    expect(r.headers()["location"] ?? "", p).toMatch(/\/login\?next=/);
  }
});

test("guest calendar files are refused and never cached publicly", async ({ request }) => {
  for (const p of ["/calendar.ics", "/calendar-en.ics", "/api/calendar/zero-to-hero-1", "/api/calendar/zero-to-hero-1?locale=en", "/calendar.ics?k=wrong"]) {
    const r = await request.get(p);
    expect(r.status(), p).toBe(401);
    expect(r.headers()["cache-control"] ?? "", p).toMatch(/private/);
    expect(await r.text(), p).not.toMatch(/BEGIN:VEVENT/);
  }
  expect((await request.get("/api/calendar/..%2F..%2Fetc")).status()).toBe(404);
});

test("sitemap lists no meetup pages", async ({ request }) => {
  expect(await (await request.get("/sitemap.xml")).text()).not.toMatch(/\/events\//);
});
