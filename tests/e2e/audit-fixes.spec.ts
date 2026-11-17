import { test, expect, type Page } from "@playwright/test";

/**
 * Regression specs for the M1 audit fixes (qa/AUDIT-M1.md items S3, S4, S6, S7, N2, N3, N6 and the intro-opacity note).
 * Guest level, fixtures build, clock fixed by playwright.config.ts (12 Nov 2026 10:00 Jerusalem).
 */
const TENTATIVE = "joint-event-ori-goshen";

async function jsonLd(page: Page) {
  const raw = await page.locator('script[type="application/ld+json"]').allTextContents();
  return raw.map((r) => JSON.parse(r));
}

test.describe("structured data", () => {
  for (const [lang, home] of [["he", "/"], ["en", "/en"]] as const) {
    test(`home has an Organization [${lang}]`, async ({ page }) => {
      await page.goto(home);
      const blocks = (await jsonLd(page)).flatMap((b) => (Array.isArray(b) ? b : b["@graph"] ?? [b]));
      const org = blocks.find((b) => /Organization/.test([b["@type"]].flat().join()));
      expect(org, "Organization JSON-LD").toBeTruthy();
      expect(org["@context"] ?? "https://schema.org").toMatch(/schema\.org/);
      expect(org.name).toMatch(/TAU AI Club/);
      expect(org.url).toMatch(/^https?:\/\//);
    });

    test(`event page has a valid Event [${lang}]`, async ({ page }) => {
      const prefix = lang === "he" ? "" : "/en";
      await page.goto(`${prefix}/events/zero-to-hero-1`);
      const blocks = (await jsonLd(page)).flatMap((b) => (Array.isArray(b) ? b : b["@graph"] ?? [b]));
      const ev = blocks.find((b) => [b["@type"]].flat().includes("Event"));
      expect(ev, "Event JSON-LD").toBeTruthy();
      expect(ev.name).toContain("Zero to Hero 1");
      // Offsets matter: 18:00 Jerusalem in November is +02:00.
      expect(ev.startDate, "startDate").toMatch(/^2026-11-18T18:00(:00)?(\+02:00|[+-]\d\d:\d\d)$/);
      expect(ev.endDate, "endDate").toMatch(/^2026-11-18T20:00(:00)?(\+02:00|[+-]\d\d:\d\d)$/);
      expect(Date.parse(ev.endDate)).toBeGreaterThan(Date.parse(ev.startDate));
      expect(ev.eventStatus).toMatch(/EventScheduled/);
      expect(ev.eventAttendanceMode).toMatch(/OfflineEventAttendanceMode|MixedEventAttendanceMode/);
      expect(ev.location, "location").toBeTruthy();
      expect(JSON.stringify(ev.location)).toMatch(/Place|VirtualLocation/);
      expect(ev.url).toMatch(new RegExp(`${prefix}/events/zero-to-hero-1$`));
      // Nothing private in structured data.
      expect(JSON.stringify(blocks)).not.toMatch(/mailto:|tel:|@[a-z0-9-]+\.[a-z]{2,}|linkedin\.com\/in/i);
    });
  }

  test("tentative event ships NO Event JSON-LD (dates are not confirmed)", async ({ page }) => {
    for (const p of [`/events/${TENTATIVE}`, `/en/events/${TENTATIVE}`]) {
      await page.goto(p);
      const blocks = (await jsonLd(page)).flatMap((b) => (Array.isArray(b) ? b : b["@graph"] ?? [b]));
      expect(blocks.some((b) => [b["@type"]].flat().includes("Event")), p).toBe(false);
    }
  });

  test("every JSON-LD block is valid JSON, no raw </script> breakout, on all pages", async ({ request }) => {
    for (const p of ["/", "/en", "/events/zero-to-hero-1", "/en/events/zero-to-hero-1", `/events/${TENTATIVE}`, "/events/cohort-02-closing"]) {
      const html = await (await request.get(p)).text();
      for (const m of html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
        expect(() => JSON.parse(m[1]), p).not.toThrow();
        expect(m[1], p).not.toMatch(/<\/script/i);
        expect(m[1], p).not.toContain("<!--");
      }
    }
  });
});

test.describe("tentative events in share metadata", () => {
  for (const [lang, prefix, word] of [["he", "", "טנטטיבי"], ["en", "/en", "Tentative"]] as const) {
    test(`description, og:title and twitter:title say tentative [${lang}]`, async ({ page }) => {
      await page.goto(`${prefix}/events/${TENTATIVE}`);
      const meta = await page.evaluate(() => ({
        desc: document.querySelector('meta[name="description"]')?.getAttribute("content") ?? "",
        og: document.querySelector('meta[property="og:title"]')?.getAttribute("content") ?? "",
        tw: document.querySelector('meta[name="twitter:title"]')?.getAttribute("content") ?? "",
        ogDesc: document.querySelector('meta[property="og:description"]')?.getAttribute("content") ?? "",
      }));
      expect(meta.desc).toContain(word);
      expect(meta.og).toContain(word);
      expect(meta.tw, "twitter:title").toContain(word);
      expect(meta.ogDesc, "og:description").toContain(word);
    });
    test(`a confirmed event is NOT labelled tentative [${lang}]`, async ({ page }) => {
      await page.goto(`${prefix}/events/zero-to-hero-1`);
      const all = await page.evaluate(() => [...document.querySelectorAll('meta[name="description"], meta[property="og:title"], meta[name="twitter:title"]')].map((m) => m.getAttribute("content")).join(" | "));
      expect(all).not.toMatch(/טנטטיבי|tentative/i);
    });
  }
});

test.describe("language switch", () => {
  test("Hebrew switch links to / (no redirect hop); English switch links to /en", async ({ page, request }) => {
    await page.goto("/en");
    const he = page.locator('a[hreflang="he"]').first();
    expect(await he.getAttribute("href")).toBe("/");
    await page.goto("/");
    expect(await page.locator('a[hreflang="en"]').first().getAttribute("href")).toBe("/en");
    // Deep pages keep their place.
    await page.goto("/en/events/zero-to-hero-1");
    expect(await page.locator('a[hreflang="he"]').first().getAttribute("href")).toBe("/events/zero-to-hero-1");
    await page.locator('a[hreflang="he"]').first().click();
    await expect(page).toHaveURL(/\/events\/zero-to-hero-1$/);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    // The old /he/ URL still redirects (bookmarks).
    expect((await request.get("/he", { maxRedirects: 0 })).status()).toBe(307);
  });
});

test.describe("response headers", () => {
  for (const p of ["/", "/en", "/events/zero-to-hero-1", "/nope", "/calendar.ics", "/sitemap.xml", "/robots.txt"]) {
    test(`security headers on ${p}`, async ({ request }) => {
      const r = await request.get(p, { maxRedirects: 0 });
      const h = r.headers();
      expect(h["x-powered-by"], "X-Powered-By").toBeUndefined();
      expect(h["link"], "Link header (hreflang) was removed").toBeUndefined();
      expect(h["x-content-type-options"]).toBe("nosniff");
      expect(h["referrer-policy"]).toMatch(/strict-origin|no-referrer|same-origin/);
      expect(h["permissions-policy"] ?? "").toMatch(/camera=\(\)|geolocation=\(\)/);
      expect(h["x-frame-options"] ?? h["content-security-policy-report-only"] ?? "").toMatch(/DENY|SAMEORIGIN|frame-ancestors/i);
      // CSP is report-only for now: it must not enforce yet.
      expect(h["content-security-policy"], "enforcing CSP").toBeUndefined();
      expect(h["content-security-policy-report-only"], "CSP report-only").toBeTruthy();
    });
  }

  test("CSP report-only policy is sane (no wildcard script sources, no unsafe-eval)", async ({ request }) => {
    const csp = (await request.get("/")).headers()["content-security-policy-report-only"] ?? "";
    expect(csp).toMatch(/default-src/);
    expect(csp).not.toMatch(/script-src[^;]*\s\*(\s|;|$)/);
    expect(csp).not.toMatch(/unsafe-eval/);
    expect(csp).toMatch(/frame-ancestors/);
    expect(csp).toMatch(/object-src 'none'/);
  });

  test("CSP READINESS: pages raise no report-only violations (so flipping to enforcing will not break them)", async ({ page }) => {
    const violations: string[] = [];
    page.on("console", (m) => {
      if (/content security policy|\[report only\]/i.test(m.text())) violations.push(m.text().slice(0, 200));
    });
    for (const p of ["/", "/en", "/events/zero-to-hero-1", "/en/events/zero-to-hero-1", "/nope"]) {
      await page.goto(p, { waitUntil: "networkidle" });
      // exercise the dial pop-up too
      if (p === "/en") {
        await page.locator('[data-testid=timeline-item] a').nth(2).click();
        await page.waitForTimeout(300);
      }
    }
    expect(violations).toEqual([]);
  });
});

test.describe("404 titles", () => {
  for (const [p, re] of [
    ["/nope", /לא נמצא/],
    ["/en/nope", /not found/i],
    ["/events/nope", /לא נמצא/],
    ["/en/events/nope", /not found/i],
  ] as const) {
    test(`${p} has a localized, noindex 404 title`, async ({ page, request }) => {
      const res = await request.get(p, { maxRedirects: 0 });
      expect(res.status()).toBe(404);
      await page.goto(p);
      expect(await page.title()).toMatch(re);
      expect(await page.locator('meta[name="robots"]').first().getAttribute("content")).toMatch(/noindex/);
      await expect(page.locator("html")).toHaveAttribute("lang", p.startsWith("/en") ? "en" : "he");
    });
  }
});

test.describe("sitemap and feeds", () => {
  test("every sitemap URL has a valid <lastmod> and both language alternates", async ({ request }) => {
    const xml = await (await request.get("/sitemap.xml")).text();
    const urls = xml.split("<url>").slice(1);
    expect(urls.length).toBeGreaterThanOrEqual(20);
    for (const u of urls) {
      const lm = u.match(/<lastmod>([^<]+)<\/lastmod>/)?.[1];
      expect(lm, u.slice(0, 70)).toBeTruthy();
      expect(Number.isNaN(Date.parse(lm!)), `${lm}`).toBe(false);
      expect(Date.parse(lm!), `${lm} is in the far future`).toBeLessThan(Date.now() + 86400_000);
      expect(u).toMatch(/hreflang="he"/);
      expect(u).toMatch(/hreflang="en"/);
    }
  });

  for (const f of ["/calendar.ics", "/calendar-en.ics"]) {
    test(`feed ${f}: stable slug UIDs, LAST-MODIFIED and SEQUENCE on every event`, async ({ request }) => {
      const ics = (await (await request.get(f)).text()).replace(/\r\n[ \t]/g, "");
      const events = ics.split("BEGIN:VEVENT").slice(1);
      expect(events.length).toBe(9);
      const uids = events.map((e) => e.match(/^UID:(.*)$/m)![1].trim());
      expect(new Set(uids).size).toBe(9);
      for (const uid of uids) expect(uid, "UID").toMatch(/^[a-z0-9-]+@tau-ai-club$/);
      expect(uids).toContain("zero-to-hero-1@tau-ai-club");
      for (const e of events) {
        expect(e).toMatch(/^LAST-MODIFIED:\d{8}T\d{6}Z\s*$/m);
        expect(e).toMatch(/^SEQUENCE:\d+\s*$/m);
        const stamp = e.match(/^DTSTAMP:(\d{8}T\d{6}Z)/m)![1];
        const lm = e.match(/^LAST-MODIFIED:(\d{8}T\d{6}Z)/m)![1];
        expect(lm <= stamp, `LAST-MODIFIED ${lm} must not be after DTSTAMP ${stamp}`).toBe(true);
      }
    });
  }

  test("feed UIDs and LAST-MODIFIED are stable across requests (so calendar apps do not see phantom changes)", async ({ request }) => {
    const pick = async () => {
      const t = await (await request.get("/calendar-en.ics")).text();
      return [...t.matchAll(/^(UID|LAST-MODIFIED|SEQUENCE):.*$/gm)].map((m) => m[0]).join("\n");
    };
    expect(await pick()).toBe(await pick());
  });
});

test.describe("intro animation never hides the hero from LCP", () => {
  test("hero intro keyframes start above opacity 0", async ({ page }) => {
    await page.goto("/");
    const res = await page.evaluate(() => {
      const out: { name: string; first: string }[] = [];
      const names = new Set<string>();
      for (const el of document.querySelectorAll("h1, .intro, [data-testid=next-event-card]")) {
        const n = getComputedStyle(el).animationName;
        if (n && n !== "none") n.split(",").forEach((x) => names.add(x.trim()));
      }
      for (const sheet of document.styleSheets) {
        let rules: CSSRuleList;
        try {
          rules = sheet.cssRules;
        } catch {
          continue;
        }
        for (const r of rules) {
          if (r instanceof CSSKeyframesRule && names.has(r.name)) {
            const f = [...r.cssRules].find((k) => /^(0%|from)$/.test((k as CSSKeyframeRule).keyText)) as CSSKeyframeRule | undefined;
            out.push({ name: r.name, first: f?.style.opacity ?? "" });
          }
        }
      }
      return { out, names: [...names] };
    });
    for (const k of res.out) expect(parseFloat(k.first || "1"), `keyframes ${k.name} start opacity`).toBeGreaterThan(0);
  });

  test("the Next-event card and hero text are not transparent at first paint", async ({ page }) => {
    await page.goto("/", { waitUntil: "commit" });
    await page.waitForSelector("[data-testid=next-event-card]", { state: "attached" });
    const o = await page.evaluate(() => ({
      card: getComputedStyle(document.querySelector("[data-testid=next-event-card]")!).opacity,
      h1: getComputedStyle(document.querySelector("h1")!).opacity,
    }));
    expect(parseFloat(o.card)).toBe(1);
    expect(parseFloat(o.h1)).toBeGreaterThan(0);
  });
});
