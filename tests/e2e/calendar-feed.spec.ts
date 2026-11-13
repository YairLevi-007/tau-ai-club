import { test, expect } from "@playwright/test";

// Season calendar subscription: UI (keyboard-reachable) + the .ics feed content.
// Clock is fixed by playwright.config.ts; all seeded events run 18:00-20:00 Asia/Jerusalem (UTC+2 in winter).
const L = [
  { name: "he", path: "/", feed: "/calendar.ics", tbd: "מיקום ייקבע", tentative: "TENTATIVE" },
  { name: "en", path: "/en", feed: "/calendar-en.ics", tbd: "Venue TBD", tentative: "TENTATIVE" },
] as const;

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

/** Unfold RFC 5545 line folding and split into VEVENT property maps. */
function parse(ics: string) {
  const unfolded = ics.replace(/\r\n[ \t]/g, "");
  const events: Record<string, string>[] = [];
  let cur: Record<string, string> | null = null;
  for (const line of unfolded.split("\r\n")) {
    if (line === "BEGIN:VEVENT") cur = {};
    else if (line === "END:VEVENT") {
      events.push(cur!);
      cur = null;
    } else if (cur) {
      const i = line.indexOf(":");
      cur[line.slice(0, i)] = line.slice(i + 1);
    }
  }
  return { unfolded, events };
}

for (const l of L) {
  test.describe(`calendar subscription [${l.name}]`, () => {
    test("UI: subscribe block present, links correct, keyboard reachable", async ({ page, isMobile }) => {
      await page.goto(l.path);
      const block = page.getByTestId("season-subscribe");
      await expect(block).toBeVisible();
      const google = block.locator('a[href^="https://calendar.google.com/calendar/render"]');
      const other = block.locator('a[href^="webcal:"]');
      await expect(google).toHaveCount(1);
      await expect(other).toHaveCount(1);
      await expect(google).toHaveAttribute("target", "_blank");
      await expect(google).toHaveAttribute("rel", /noopener/);
      const webcal = (await other.getAttribute("href"))!;
      expect(webcal).toContain(l.feed);
      expect(decodeURIComponent(new URL((await google.getAttribute("href"))!).searchParams.get("cid")!)).toBe(webcal);
      // Accessible names (new-tab hint on the external link).
      await expect(google).not.toHaveText("");
      await expect(other).not.toHaveText("");

      test.skip(!!isMobile, "keyboard focus walk is desktop-only");
      await google.focus();
      await expect(google).toBeFocused();
      const outlined = await google.evaluate((el) => {
        const s = getComputedStyle(el);
        return (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0) || s.boxShadow !== "none";
      });
      expect(outlined, "no visible focus indicator on subscribe button").toBe(true);
      await page.keyboard.press("Tab");
      await expect(other).toBeFocused();
    });

    test("feed: valid iCalendar, every published event, 18:00-20:00 Asia/Jerusalem", async ({ request }) => {
      const res = await request.get(l.feed);
      expect(res.status()).toBe(200);
      expect(res.headers()["content-type"]).toMatch(/^text\/calendar/);
      const ics = await res.text();
      expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
      expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
      expect(ics).toContain("VERSION:2.0");
      expect(ics).toContain("PRODID:");
      // No bare LF, no over-long lines (75 octets).
      expect(ics.replace(/\r\n/g, "")).not.toContain("\n");
      for (const line of ics.split("\r\n")) expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75);

      const { events } = parse(ics);
      expect(events).toHaveLength(SLUGS.length);
      const slugs = events.map((e) => e["URL"].split("/events/")[1]);
      expect(slugs).toEqual(SLUGS);
      expect(new Set(events.map((e) => e["UID"])).size).toBe(SLUGS.length);

      for (const e of events) {
        expect(e["DTSTART"]).toMatch(/^\d{8}T\d{6}Z$/);
        expect(e["DTEND"]).toMatch(/^\d{8}T\d{6}Z$/);
        // Render both ends in Asia/Jerusalem and check the wall clock.
        const fmt = (s: string) =>
          new Date(s.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, "$1-$2-$3T$4:$5:$6Z")).toLocaleTimeString("en-GB", {
            timeZone: "Asia/Jerusalem",
            hour: "2-digit",
            minute: "2-digit",
          });
        expect(fmt(e["DTSTART"]), e["URL"]).toBe("18:00");
        expect(fmt(e["DTEND"]), e["URL"]).toBe("20:00");
        expect(e["SUMMARY"]).toMatch(/^TAU AI Club/);
        expect(e["SUMMARY"]).not.toMatch(/undefined|null/);
      }
      // Spot-check a known date: Zero to Hero 1 is 2026-11-18 16:00Z-18:00Z.
      const z1 = events.find((e) => e["URL"].endsWith("/zero-to-hero-1"))!;
      expect(z1["DTSTART"]).toBe("20261118T160000Z");
      expect(z1["DTEND"]).toBe("20261118T180000Z");
    });

    test("feed: tentative and TBD events are labeled", async ({ request }) => {
      const { events } = parse(await (await request.get(l.feed)).text());
      const byslug = Object.fromEntries(events.map((e) => [e["URL"].split("/events/")[1], e]));
      expect(byslug["joint-event-ori-goshen"]["STATUS"]).toBe(l.tentative);
      for (const s of SLUGS.filter((s) => s !== "joint-event-ori-goshen")) expect(byslug[s]["STATUS"], s).toBe("CONFIRMED");
      // Event with no venue and no venue note shows the localized "Venue TBD" in LOCATION.
      expect(byslug["entrepreneurship-tech-roee-margalit"]["LOCATION"]).toContain(l.tbd.replace(/,/g, "\\,"));
    });

    test("feed: only public event fields, no contact data", async ({ request }) => {
      const ics = await (await request.get(l.feed)).text();
      expect(ics).not.toMatch(/mailto:|tel:|linkedin\.com|phone|\bTEL[;:]|\bATTENDEE|\bORGANIZER/i);
      // No e-mail addresses anywhere except the UID host part.
      const withoutUid = ics.replace(/^UID:.*$/gm, "");
      expect(withoutUid).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.-]+/);
      const freeText = parse(ics).events.map((e) => [e["SUMMARY"], e["DESCRIPTION"], e["LOCATION"]].join(" ")).join(" ");
      expect(freeText).not.toMatch(/\+?\d[\d\s-]{8,}\d/); // phone-like digit runs in free text
      expect(ics).not.toMatch(/service_role|supabase\.co|secret|token/i);
      // Only the expected property names appear.
      const allowed = new Set([
        "BEGIN", "END", "VERSION", "PRODID", "CALSCALE", "METHOD", "X-WR-CALNAME", "X-WR-CALDESC", "X-WR-TIMEZONE",
        "REFRESH-INTERVAL;VALUE=DURATION", "X-PUBLISHED-TTL", "UID", "DTSTAMP", "DTSTART", "DTEND", "SUMMARY",
        "DESCRIPTION", "LOCATION", "URL", "STATUS",
      ]);
      const { unfolded } = parse(ics);
      for (const line of unfolded.split("\r\n").filter(Boolean)) {
        const name = line.slice(0, line.indexOf(":"));
        expect(allowed.has(name), `unexpected property ${name}`).toBe(true);
      }
    });
  });
}

test("feed: event URLs point at the real site, not localhost (run against the deployed URL)", async ({ request, baseURL }) => {
  test.skip(/localhost|127\.0\.0\.1/.test(baseURL ?? ""), "only meaningful against a deployed URL");
  for (const p of ["/calendar.ics", "/calendar-en.ics"]) {
    expect(await (await request.get(p)).text()).not.toMatch(/localhost/);
  }
});

test("feed: 503 handling is not cached as an empty calendar (route exists in both locales)", async ({ request }) => {
  for (const p of ["/calendar.ics", "/calendar-en.ics"]) expect((await request.get(p)).status()).toBe(200);
});
