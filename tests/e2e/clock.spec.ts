import { test, expect } from "@playwright/test";
import { startDev } from "./helpers/server";

/**
 * TEST-PLAN 1.3 / 1.4: Next-event card + timeline states against a pinned server clock.
 * Expected values derive from supabase/seed.sql (all events 18:00-20:00 Asia/Jerusalem).
 * Order: opening 11-11, z2h-1 11-18, z2h-2 11-25, or-maccabi 12-02, z2h-3 12-16,
 * roee 12-23, tomer 12-30, ori (tentative) 2027-01-03, closing 2027-01-06.
 */
type Case = { name: string; now: string; next: string | null; nextState?: "next" | "live"; past: string[] };
const O = "cohort-02-opening",
  Z1 = "zero-to-hero-1",
  Z2 = "zero-to-hero-2",
  M = "entrepreneurship-tech-or-maccabi",
  Z3 = "zero-to-hero-3",
  R = "entrepreneurship-tech-roee-margalit",
  TOM = "growth-capital-tomer-diari",
  ORI = "joint-event-ori-goshen",
  CL = "cohort-02-closing";

const cases: Case[] = [
  { name: "day after opening", now: "2026-11-12T10:00:00+02:00", next: Z1, nextState: "next", past: [O] },
  { name: "evening before event 23:59:59", now: "2026-11-17T23:59:59+02:00", next: Z1, nextState: "next", past: [O] },
  { name: "00:30 Jerusalem on event day (UTC still previous day)", now: "2026-11-17T22:30:00Z", next: Z1, nextState: "next", past: [O] },
  { name: "morning of event day", now: "2026-11-18T08:00:00+02:00", next: Z1, nextState: "next", past: [O] },
  { name: "17:59:59 just before start", now: "2026-11-18T17:59:59+02:00", next: Z1, nextState: "next", past: [O] },
  { name: "18:00:00 start is live", now: "2026-11-18T18:00:00+02:00", next: Z1, nextState: "live", past: [O] },
  { name: "19:59:59 still live", now: "2026-11-18T19:59:59+02:00", next: Z1, nextState: "live", past: [O] },
  { name: "20:00:00 ended, advances to next", now: "2026-11-18T20:00:00+02:00", next: Z2, nextState: "next", past: [O, Z1] },
  { name: "23:59 same night after event", now: "2026-11-18T23:59:00+02:00", next: Z2, nextState: "next", past: [O, Z1] },
  { name: "mid-season live event", now: "2026-12-02T19:00:00+02:00", next: M, nextState: "live", past: [O, Z1, Z2] },
  { name: "tentative event is next", now: "2026-12-30T20:00:00+02:00", next: ORI, nextState: "next", past: [O, Z1, Z2, M, Z3, R, TOM] },
  { name: "between tentative and closing", now: "2027-01-04T10:00:00+02:00", next: CL, nextState: "next", past: [O, Z1, Z2, M, Z3, R, TOM, ORI] },
  { name: "after the last event: no future events", now: "2027-01-07T00:00:00+02:00", next: null, past: [O, Z1, Z2, M, Z3, R, TOM, ORI, CL] },
];

test.describe.configure({ mode: "serial" });
let port = 3200;
for (const c of cases) {
  test(c.name, async ({ page }) => {
    const srv = await startDev(c.now, port++);
    try {
      for (const path of ["/", "/en"]) {
        await page.goto(srv.url + path);
        const card = page.getByTestId("next-event-card");
        await expect(card).toBeVisible();
        await expect(card).toHaveAttribute("data-event-slug", c.next ?? "");
        await expect(card).not.toContainText(/undefined|null|NaN/);
        const items = page.getByTestId("timeline-item");
        const row = (slug: string) => items.filter({ has: page.locator(`a[href$="/events/${slug}"]`) });
        if (c.next) await expect(row(c.next)).toHaveAttribute("data-state", c.nextState!);
        for (const slug of c.past) await expect(row(slug)).toHaveAttribute("data-state", "past");
        const states = await items.evaluateAll((els) => els.map((e) => e.getAttribute("data-state")));
        expect(states.length).toBe(9);
        expect(states.filter((s) => s === "next" || s === "live").length).toBe(c.next ? 1 : 0);
        // Past events are never "upcoming", and nothing upcoming precedes a past one.
        expect(states.lastIndexOf("past")).toBe(c.past.length - 1);
      }
    } finally {
      await srv.stop();
    }
  });
}

test("tentative event shown without null/undefined copy", async ({ page }) => {
  const srv = await startDev("2026-12-31T10:00:00+02:00", port++);
  try {
    await page.goto(srv.url + "/en");
    const card = page.getByTestId("next-event-card");
    await expect(card).toHaveAttribute("data-event-slug", ORI);
    await expect(page.locator('[data-testid=timeline-item][data-tentative="true"]')).toHaveCount(1);
    await expect(card).not.toContainText(/null|undefined/);
    // TODO(qa): assert the localized "tentative" pill text once copy is final.
  } finally {
    await srv.stop();
  }
});
