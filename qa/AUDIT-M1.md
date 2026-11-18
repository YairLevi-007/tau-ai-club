# M1 public-site audit

Commit audited: `62862ff` (`feat/home-visual-pass` = main), production build (`next build` + `next start`), `USE_FIXTURES=1`, `NEXT_PUBLIC_SITE_URL=https://tauaiclub.com`, port 3150. The server clock was real (2026-11-17, so the next event was Zero to Hero 1 on 18 Nov).
Built from a snapshot of HEAD outside this checkout, so nothing here was touched except this file.
Pages: home, event page (+ the tentative event), 404, calendar feeds. Hebrew and English, 390 and 1440.
Tools: axe-core 4 (wcag2a/aa, 2.1, 2.2 aa, best-practice), Lighthouse 13.6 (mobile = Slow 4G, 4x CPU; desktop preset), Playwright keyboard/DOM probes, manual screenshot review.

## Verdict

**No must-fix defects.** Accessibility is clean (0 axe violations on all 16 page/locale/viewport combinations, Lighthouse a11y 100 everywhere). Three items need checking on the real production deploy (they depend on env vars this build does not have), and there are a handful of should-fix items, mostly performance on a phone and missing structured data.

## Must-verify on the production deploy (not defects here, launch blockers if they fail)

| # | Check | Why / repro | Owner |
|---|---|---|---|
| V1 | Pages are **indexable** in production | Here every page has `<meta name="robots" content="noindex, nofollow">` and `/robots.txt` is `Disallow: /`. That is intended (`IS_PRODUCTION = VERCEL_ENV === "production"`, `src/config/site.ts:23`). On the production deployment: `curl -s https://tauaiclub.com/en \| grep robots` must show no `noindex`, and `/robots.txt` must say `Allow: /` plus the sitemap line. A preview or custom-domain setup that does not set `VERCEL_ENV=production` would ship the site de-indexed. | builder |
| V2 | Canonical, OG and sitemap use `https://tauaiclub.com` (not `*.vercel.app`) | Needs `NEXT_PUBLIC_SITE_URL` set in Production. Here (with it set) canonical, `og:url`, hreflang and the sitemap are correct. Calendar feed `URL:` lines and `/api` links follow the same variable. | builder |
| V3 | Data really comes from Supabase, not fixtures | `USE_FIXTURES` is ignored when `VERCEL_ENV=production`; confirm the home page shows events (not the "data unavailable" state) once the prod project is seeded. | builder |

## Should-fix

| # | Finding | Repro | Suggested fix | Owner |
|---|---|---|---|---|
| S1 | **Home LCP is slow on a mid-range phone**: 3.3 s (en) / 3.4 s (he), Lighthouse perf 88 / 82. Event page is 0.8 s (score 100), so this is specific to the home page. LCP element is the hero intro paragraph (`p.intro`). | Lighthouse mobile on `/` and `/en`. Breakdown: TTFB 43 ms, element render delay about 1.6 s. Render-blocking CSS (167 ms) and the hydration cost below sit in front of it. | Find what delays the paint of the hero text (font swap on the Hebrew/English text, the render-blocking stylesheet, or hydration blocking the main thread) and bring LCP under 2.5 s. Try `font-display: optional`/size-adjusted fallback for the hero font, and inlining critical CSS. | builder + designer |
| S2 | **Total Blocking Time 240 to 400 ms on mobile** (target under 200). One chunk (`0f_wuj9prht_n.js`, 70 KB gzip) costs about 500 ms of scripting at 4x CPU, with a 228 ms long task. | Lighthouse mobile on `/`: "Reduce JavaScript execution time", long-tasks audit. Desktop is 0 ms. | Defer or code-split the dial and the motion library (`motion`) so they load after first paint; the Next-event card is already server-rendered, so only the dial needs JS. Also ships 14 KB legacy polyfills and about 64 KB unused JS. | builder |
| S3 | **No structured data.** No `application/ld+json` on any page. | `curl -s https://…/events/zero-to-hero-1 \| grep ld+json` returns nothing. | Add `schema.org/Event` JSON-LD on event pages (name, `startDate`/`endDate` with +02:00/+03:00 offset, `eventAttendanceMode`, `eventStatus` (use `EventScheduled`; for the tentative one omit exact dates or mark as postponed-style per Google's rules), `location` (Place), `performer`, `organizer`, `url`, `image`) plus `Organization` on the home page. Rich results help the Luma/registration traffic. | builder |
| S4 | **Tentative event has no "tentative" signal in share metadata.** `/en/events/joint-event-ori-goshen` has description "Sunday 3 January · 18:00–20:00 · Broadcom Hall · Ori Goshen" and the generic OG image, so a link preview presents it as confirmed. | View the page `<meta name="description">` / `og:*`. | Prefix the description (or title) with the localized "Tentative" label when `is_tentative`. | builder |
| S5 | **"Back to the season" link is 20 px tall** on event pages (WCAG 2.2 target size 2.5.8 asks 24 px). Both locales, both viewports. | Tab to the first link under the header on `/events/<slug>`; measured 91x20 (he) and 147x20 (en). | Give the link `min-height: 24px` (or padding) or make the row a larger tap target. | designer |
| S6 | **Language switcher links to `/he`, which 307-redirects to `/`.** Every switch to Hebrew costs an extra round trip. | `curl -s http://…/en \| grep 'hrefLang="he"'` shows `href="/he"`; `curl -I /he` returns 307 to `/`. | Link to `/` for Hebrew (default locale, `localePrefix: "as-needed"`). | builder |
| S7 | **No security headers / `X-Powered-By` exposed.** Response has `X-Powered-By: Next.js` and none of `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `Content-Security-Policy`, `X-Frame-Options`/`frame-ancestors`. (Vercel adds HSTS.) | `curl -I /`. | `poweredByHeader: false` and a basic header set in `next.config.ts`. Start CSP in report-only. | builder |

## Nice-to-have

| # | Finding | Repro / note | Owner |
|---|---|---|---|
| N1 | Event pages all share one OG image (`/og/og-default.png`, 1200x630, 54 KB, loads fine). Per-event images (title, date, speaker) would make shares much more useful. | any event page `og:image` | designer + builder |
| N2 | 404 page `<title>` is the site title ("TAU AI Club, Tel Aviv University"), not "Page not found". Status 404, `noindex`, correct `lang`/`dir`. | `curl -s /en/nope \| grep title` | builder |
| N3 | Calendar feed has no `SEQUENCE` or `LAST-MODIFIED`; Outlook-type clients sometimes ignore changes without them. `DTSTAMP` is the request time. Sitemap has no `<lastmod>`. | `curl /calendar-en.ics`, `/sitemap.xml` | builder |
| N4 | Logo PNG is 520x322 intrinsic, served at `w=640` for a 65x40 (390) / 78x48 (1440) slot. Only 3 KB, but `w=130/160` would do. | Network panel on `/` | designer |
| N5 | Month labels on the dial ring ("ינואר" / "January") are rotated and read upside-down on the lower half of the ring. Legible but harder to scan. | screenshot of the dial, he and en | designer |
| N6 | `Link:` response header (hreflang alternates) uses the request origin, not `SITE_URL`. Fine on a single-host deploy, wrong if the site is ever reached through a proxy or `www`. | `curl -I /` | builder |
| N7 | Event page has two `<header>` and two `<nav>` landmarks (site header plus the in-page breadcrumb/prev-next). axe does not flag it; give the second nav an `aria-label`. | DOM landmark count on `/events/<slug>` | builder |
| N8 | No web app manifest (`/manifest.webmanifest` 404). Not needed for launch. | | builder |
| N9 | Below-the-fold sections use JS reveal-on-scroll, so a full-page screenshot or print shows the season section blank until it is scrolled into view. Content is in the HTML and visible with reduced motion or without JS; only affects tools that capture without scrolling. | `page.screenshot({ fullPage: true })` on `/` | designer |

## What passed (evidence)

**Accessibility**
- axe (incl. best-practice): **0 violations** on home, event, tentative event and 404, he and en, 390 and 1440 (16 combinations). Lighthouse accessibility 100 on all audited pages.
- `<html lang>` and `dir` correct everywhere, including the 404 (`he`/`rtl`, `en`/`ltr`). Language switch link carries `lang` and `hreflang`. One `h1` per page, `header/nav/main/footer` present, skip link first in the tab order and its `#main` target exists.
- Keyboard walk (70 Tab presses per page): no traps, logical order, every stop has a visible outline or shadow and stays in the viewport, no unnamed controls. Tab order is the same in Hebrew and English.
- Dial: it is a labelled `<ol>` (`Season meetups on the dial` / Hebrew equivalent) of real links named "title, weekday date". Roving tabindex (one stop), `aria-haspopup=dialog`, `aria-expanded`, Prev/Next buttons are real buttons. Arrow keys, Home/End covered by the e2e suite.
- Reduced motion: 0 running or infinite animations, nothing hidden by reveal; without it the Next-event card is at opacity 1 from the first paint.
- No horizontal scroll at 390 on any page; no console errors other than the expected 404 status on the 404 page.

**Performance (mobile, Lighthouse)**
- Home: FCP 0.9 s, **CLS 0**, SI 0.9 to 1.3 s, 333 to 338 KiB total (220 KB JS gzip, 688 KB raw; 68 KB of fonts in 5 preloaded woff2; logo 3 KB). Event page: LCP 0.8 s, TBT 40 to 60 ms, score 100. Desktop home: LCP 0.7 to 0.8 s, TBT 0, score 100.
- The **Next-event card is in the initial HTML and in the first viewport** on all four home combos (top at 344 / 372 px of 844 on mobile, 140 px of 900 on desktop). It is a server component with no entrance animation.
- Fonts are preloaded and self-hosted (Rubik, Silkscreen, IBM Plex Mono). The only image is the sized logo (width/height set, `next/image`), so there is no layout shift.
- INP was not measured (no real-device interaction trace); TBT is the lab proxy (S2).

**SEO and sharing**
- Distinct localized `<title>` and description per page and locale; event descriptions carry the date, time, venue and speaker. `rel=canonical` and `hreflang` (he, en, x-default) on every page, plus the same alternates in the sitemap. `og:*`, `twitter:summary_large_image`, OG image 1200x630 with alt text, `og:locale` and `og:locale:alternate`. `/sitemap.xml` lists 20 URLs (home + 9 events, both locales), no private or noindex pages. Lighthouse SEO is 61 only because of the intentional non-production `noindex` and the cross-origin canonical (see V1/V2).
- Calendar feeds: valid iCalendar, `text/calendar`, 9 events 18:00-20:00 Jerusalem (UTC in the file), `STATUS:TENTATIVE` for the tentative event, Hebrew text intact, escaped commas, `X-WR-TIMEZONE`, 6 h refresh hints, no contact data.

**RTL polish** (screenshots and DOM probes, he at 390 and 1440)
- Layout mirrors correctly: rail, legend, card, Prev/Next buttons. Directional icons are right: "Back to the season" and "previous" point right, "next" and "Details" point left in Hebrew; chevrons swap too; the logo and calendar icon are not mirrored.
- No unwrapped mixed Hebrew/Latin/number runs found by the DOM scan (it counted 19 `bdi`/`dir`-wrapped runs on the home page). Dates read correctly ("יום רביעי, 18 בנובמבר", time range `18:00–20:00` kept left-to-right), `מחזור 02`, `Zero to Hero 1: Claude` inside Hebrew lines, and the trailing period after "Pro" at the end of the Hebrew blurb all render in the right order.

## Method limits
- Fixtures stand in for Supabase; the audit says nothing about live data or ISR revalidation against a real database.
- Lighthouse ran on a developer machine with simulated throttling; use the numbers for relative comparison and re-run on the deployed URL before launch.
- Screen-reader behaviour was checked through the accessibility tree (aria snapshots), not with NVDA/VoiceOver.
