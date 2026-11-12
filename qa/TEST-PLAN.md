# TAU AI Club — QA Test Plan

QA reports, never fixes. Each item: PASS / FAIL + screenshot + exact repro steps.
Status legend: `[ ]` not run · `[x]` pass · `[!]` fail (link report).

## 0. Setup

- [ ] Run against the **production build** (`next build && next start`) and the deployed URL — not `next dev`.
- [ ] Playwright projects: `{he, en} × {desktop 1440×900, mobile 390×844}` = 4 combos per page.
- [ ] Clock control: use `page.clock` / `context` + a test Supabase dataset (seed events relative to a fixed "now"); timezone `Asia/Jerusalem`. Also run once with the browser timezone set to `America/New_York` and `UTC` (the card must still follow Asia/Jerusalem, not the viewer's zone).
- [ ] Record which URL, commit, Supabase project, and date the run covers.

## 1. Milestone 1 — public home page

### 1.1 Page load and structure (all 4 combos)
- [ ] Default locale is Hebrew (RTL) at `/`; English reachable via language switcher and direct URL; choice persists across navigation/reload.
- [ ] `<html lang>` and `dir` match locale (`he`/`rtl`, `en`/`ltr`); `<title>`, meta description, OG tags localized.
- [ ] Hero: headline, subline, primary CTA visible above the fold at 1440 and 390; CTA works.
- [ ] Nav/header/footer present, links work, no dead links (crawl all `<a>`; none 404).
- [ ] No console errors/warnings, no failed network requests, no hydration warnings.
- [ ] No layout shift visible on load (CLS < 0.1); no flash of wrong locale/direction.
- [ ] No horizontal scroll at 390 (and at 320 as a smoke check).
- [ ] Signed-out, no auth prompt or redirect on the public page.

### 1.2 "Next event" card — content
- [ ] Visible immediately (in initial HTML / first paint, no spinner, not behind scroll on desktop; on mobile at or near the top after hero).
- [ ] Shows: title, speaker, date, time range (18:00–20:00), location, **Register on Luma** button, **Add to Google Calendar**.
- [ ] Luma button opens the correct Luma URL (new tab, `rel="noopener"`).
- [ ] Google Calendar link: correct title, start/end in Asia/Jerusalem (18:00–20:00), location, description; verify the resulting calendar entry time is right for a viewer in another timezone.
- [ ] Dates/times render per locale (he: Hebrew month names, 24h; en: English). Weekday correct for the date.
- [ ] Data comes from Supabase: edit the row in the DB → card changes after revalidation window (note the delay); no hardcoded fallback shown.

### 1.3 "Next event" card — date logic (clock = Asia/Jerusalem)
Seed events and set "now" for each case:
- [ ] **Day before** event → card shows that event.
- [ ] **Morning of event day** (e.g. 08:00) → shows that event (today).
- [ ] **During event** (18:00–20:00) → still shows it (not skipped), no "register" misleading state beyond design spec.
- [ ] **After event ends** same day (20:01) → advances to the next event, or "no upcoming" state if none.
- [ ] **Exactly at boundaries**: 17:59:59, 18:00:00, 19:59:59, 20:00:00, 23:59:59, 00:00:00 next day.
- [ ] **Midnight edge**: 23:30 Jerusalem when UTC is already/still the prior/next date — card uses Jerusalem date.
- [ ] **DST switch**: dates around the March (Friday before last Sunday) and October clock changes — event still 18:00–20:00 local; calendar link correct.
- [ ] **Two events on same day / back-to-back dates** → earliest non-ended wins.
- [ ] **Unsorted DB order** → still picks the correct next event.
- [ ] **No future events** → graceful empty state (localized copy, no "undefined", no crash, no stale past event shown as "next"); timeline still renders.
- [ ] **Tentative / TBD event** (date or time or location or speaker unknown): clear "TBD"/"Tentative" label in both languages, no fake date, no broken calendar/Luma button (hidden or disabled with reason), does not break ordering; a confirmed later event vs. tentative earlier one — verify against the spec'd behavior and report ambiguity.
- [ ] **Missing optional fields** (no speaker, no Luma URL, no location): no empty labels, no "null".
- [ ] **Long title/speaker/location** (Hebrew and English, 120+ chars): wraps, no overflow/clipping.
- [ ] **Cancelled event** (if modeled): not shown as next.
- [ ] **Stale cache**: after an event ends, the card changes without a redeploy (ISR/revalidate or client-side clock); check page left open across the end time.

### 1.4 Season timeline
- [ ] All Cohort 02 season events listed in chronological order; count matches DB.
- [ ] Past events visibly styled as past (and announced to AT, not color-only); upcoming events as upcoming; the next event highlighted and consistent with the Next-event card.
- [ ] Past/upcoming status flips correctly at the same boundaries as 1.3 (day of event = not past until it ends).
- [ ] TBD/tentative events labeled, positioned sensibly.
- [ ] Each entry: title, speaker (if any), date, localized; links (Luma/recording if present) work.
- [ ] Empty timeline → graceful state.
- [ ] 390px: timeline is readable and not truncated; scroll behavior sane; 1440: no awkward empty space.
- [ ] Timeline direction mirrors in RTL (progress, connectors, arrows, alignment).

### 1.5 Hebrew RTL / English LTR
- [ ] Whole layout mirrors in RTL: nav order, hero alignment, card layout, timeline, footer, language switcher.
- [ ] Directional icons (arrows, chevrons, external-link) flip in RTL; non-directional icons (logo, calendar, check) do not.
- [ ] Mixed text: English names/titles ("GPT", "TAU AI Club", speaker names) inside Hebrew sentences — correct bidi, no reversed punctuation, parentheses, or trailing periods.
- [ ] Numbers, times (18:00–20:00), and dates read correctly in Hebrew context (range not reversed).
- [ ] Hebrew font renders (no tofu/fallback look), line-height OK for Hebrew, no clipped ascenders/descenders.
- [ ] Language switch keeps the user on the equivalent page; `hreflang`/canonical correct.
- [ ] Text expansion: English and Hebrew strings both fit buttons/cards at 390.

### 1.6 Responsive
- [ ] 1440×900 and 390×844 screenshots reviewed per locale (4 baseline screenshots).
- [ ] Smoke at 768 and 1024 and 320: no overlap, no cut-off.
- [ ] Touch targets ≥ 44×44 on mobile (buttons, links, switcher).
- [ ] Mobile menu (if any) opens/closes, keyboard-accessible, mirrored in RTL.

### 1.7 Motion and `prefers-reduced-motion`
- [ ] With `reducedMotion: 'reduce'`: no parallax, auto-play, large transforms, or looping animation; content fully visible and usable; transitions removed or reduced to fades.
- [ ] Without it: animations don't hide content before JS runs (no invisible-until-animated content), don't block interaction, don't janks (no layout shift).
- [ ] Animated content is still present in page text/accessibility tree.
- [ ] No auto-playing media with sound; any moving content > 5s has a pause control.

### 1.8 Accessibility (WCAG 2.2 AA)
- [ ] axe-core run on every combo: zero serious/critical violations; list the rest.
- [ ] Contrast: text ≥ 4.5:1 (large ≥ 3:1), UI components/focus indicators ≥ 3:1 — check both locales and any text over images/gradients, disabled/past-event styling.
- [ ] Keyboard: full tab order logical (and mirrored sensibly in RTL), no traps, skip-to-content link, visible focus on every interactive element, language switcher and mobile menu operable by keyboard.
- [ ] Landmarks and headings: one `h1`, no skipped levels, `main`/`nav`/`footer`.
- [ ] Links/buttons have accessible names (icon-only ones too); links opening new tab say so; "Register on Luma" not just "click here".
- [ ] Images: meaningful alt text in the right language, decorative ones `alt=""`.
- [ ] Meaning not conveyed by color alone (past/upcoming/next).
- [ ] Zoom 200% and text-only 200% / 400% reflow at 1280 width: no loss of content.
- [ ] Screen-reader spot check (or accessibility-tree snapshot): date/time are read sensibly in both languages; `<time datetime>` used with correct offset.
- [ ] `lang` attribute on mixed-language fragments where it matters.

### 1.9 Production hygiene
- [ ] No host/dev badges or toolbars (Vercel toolbar/comments, Netlify drawer, Next.js dev indicator, Supabase/preview banners) on the production URL; check as signed-out guest in a clean context, and desktop + mobile.
- [ ] No `localhost`, staging URLs, or test data in HTML, links, OG tags, sitemap.
- [ ] No source maps exposing source in production (report if exposed), no debug `console.log` noise.
- [ ] Anon Supabase key only (grep bundle/HTML for `service_role`, secrets, `.env` content); none present.
- [ ] Favicon, OG image, `robots.txt`, `sitemap.xml`, 404 page (both locales, RTL for he) all work.
- [ ] HTTPS only, www/non-www redirect sane, security headers present (report-only note).
- [ ] Performance smoke (Lighthouse mobile): LCP/CLS/TBT noted; flag LCP > 2.5s.
- [ ] Public Supabase REST with anon key: events endpoint returns only public columns (preview of Milestone 2 checks below).

### 1.10 Exit criteria for Milestone 1
- [ ] All of 1.1–1.9 pass or have an accepted, documented exception.
- [ ] Zero open serious/critical a11y issues, zero RTL layout bugs, zero date-logic failures.
- [ ] Final report: matrix of pages × locale × viewport with pass/fail, screenshot folder, list of failures with repro.

---

## 2. Milestone 2 — roles and RLS leak tests (sketch)

### 2.1 Roles and accounts
Test accounts: **guest** (no session), **non-allowlisted** (Google sign-in, email not on list), **member** (allowlisted), **admin**. Plus a member with LinkedIn opted-in and one opted-out; a speaker with email/phone/LinkedIn all set, per-field consent mixed.

### 2.2 Page access matrix (each × he/en × desktop/mobile)
- [ ] Guest: public pages OK; members-only pages show "Members only" (localized) with sign-in prompt, and no data behind it in HTML.
- [ ] Non-allowlisted: after Google sign-in sees "Members only"; no member data; can sign out; no redirect loop.
- [ ] Member: sees member pages and profiles; no admin UI, admin routes return 403/redirect.
- [ ] Admin: manage events/members/allowlist/speakers; changes persist and are reflected publicly.
- [ ] Direct URL access to member/admin routes as each role; server actions/route handlers reject unauthorized calls.
- [ ] Allowlist edge cases: email case differences, `+` aliases, removed member loses access on next request, session expiry, sign-out clears access.

### 2.3 Speaker contact data leak tests (must never leak)
Fields: email, phone (members-only), LinkedIn (public only if opted in), plus per-field consent flags.
For **guest** and **non-allowlisted**, and LinkedIn-not-opted-in for **all roles except owner/admin as spec'd**:
- [ ] Rendered pages (he + en): text and DOM; Playwright `page.content()` grep for the seeded email/phone/LinkedIn values.
- [ ] **Page source / RSC payload / `__NEXT_DATA__` / flight data / hydration JSON**: grep raw response bytes.
- [ ] Supabase REST/PostgREST with **anon key** directly: `select=*` on speakers/profiles/contacts tables and views, embedded resources (`?select=*,speakers(*)`), RPCs, `Prefer: count`, filters on the hidden column (e.g. `?email=eq.…` must not act as an oracle), `order` by hidden column.
- [ ] Same with a **non-allowlisted user's JWT**.
- [ ] Storage buckets, GraphQL endpoint (if enabled), Realtime subscriptions, edge functions.
- [ ] Next.js API routes and server actions: responses and error messages.
- [ ] **OG/meta tags**, JSON-LD, `<title>`, `sitemap.xml`, RSS, image alt text, `mailto:`/`tel:` links in public HTML.
- [ ] Caching: member-rendered page not served from CDN/ISR cache to a guest (log in as member, load, then fetch as guest); `Cache-Control`/`Vary` correct.
- [ ] Logs/console/network tab and error pages don't echo contact values.
- [ ] Member sees email/phone only where spec'd and only for consented fields; per-field consent toggles respected (consent off → hidden from members too, as spec'd).
- [ ] Opt-out takes effect immediately; revoking LinkedIn consent removes it from public pages after revalidation.
- [ ] Write-side: anon/non-allowlisted/member cannot INSERT/UPDATE/DELETE on events, speakers, allowlist, roles; member cannot escalate to admin by editing own profile row (`role` column); cannot edit another user's profile.
- [ ] RLS is enabled on every table (`pg_tables.rowsecurity`), no table with policies `USING (true)` for anon beyond intended public columns; run Supabase advisors; views use `security_invoker`.

### 2.4 Speaker contact form
- [ ] Per-field consent checkboxes unchecked by default; required/optional validation in he/en; RTL layout; errors announced to AT.
- [ ] Submission stores only consented fields; non-consented fields not stored (verify in DB).
- [ ] Spam/abuse: rate limit, oversized input, HTML/script injection rendered escaped.
- [ ] Accessibility and reduced-motion per 1.7–1.8.

### 2.5 Auth hygiene
- [ ] Google OAuth redirect URLs limited to prod/localhost; no open redirect via `next=` param.
- [ ] Cookies `Secure`, `HttpOnly` where applicable; no tokens in URLs or logged.
- [ ] Session persists across reload, invalid/expired token handled gracefully.

### 2.6 Exit criteria for Milestone 2
- [ ] Zero leaks across all vectors above for every role; matrix of role × page × locale × viewport; leak-test script committed under `qa/` and re-runnable.
