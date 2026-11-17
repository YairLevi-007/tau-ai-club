# TAU AI Club site: plan v0.1 (for approval)

Status: **proposal**. Written 2026-11-12. Deadline: Milestone 1 live by end of **Nov 17** (Zero to Hero 1 is Nov 18).

Decided so far:
- **Hosting:** Vercel Hobby. Production URL **`https://tauaiclub.com`** (bought by the club 2026-11-15); `www` redirects to the apex, and `tau-ai-club.vercel.app` stays as a fallback. Setup: `HANDOVER.md` §3 B2. `docs/hosting-options.md` keeps the Cloudflare option for later.
- **Events:** 18:00–20:00 Asia/Jerusalem. Past events are shown as past. Unknown venues show as TBD.
- **No AI and no paid API anywhere on the site (2026-11-16).** No Claude or other model is called, now or later; there is no AI key and no AI cost.
- **Lecture summaries (2026-11-13):** a club member writes each summary, and an admin pastes it (Markdown, he/en) or attaches the PDF, then publishes.
- **Attendance from Luma (2026-11-17), free.** No Luma API (it needs a paid Luma Plus plan). At the door the club checks guests in with Luma's free check-in (the Luma app scans their QR codes). After the event an admin exports the guest list from Luma (Guests → Export CSV) and uploads it on the event's admin page. The file is read in the browser; only email, registration status and check-in time go to the server, where members are matched by any of their emails. Only members are stored (`attendance`); guests who aren't members are only counted (`attendance_imports`), never stored. Admins see per-event numbers, a per-member history and a season grid (with a CSV export); each member sees their own attendance on `/profile`.
- **Event import (2026-11-16), rule-based and free.** On `/admin/events/new` an admin can (1) paste the event's Luma link: the server fetches the public Luma page (only `lu.ma` / `luma.com`, with a timeout, a size cap and no redirects to other hosts) and reads its schema.org Event data (title, start/end, place, cover image); or (2) upload the flyer image: it is read in the admin's browser with Tesseract (Hebrew + English), and dates, times, the Luma link, and venues and speakers already in the database are picked out by pattern. Titles read off a flyer are offered as suggestions, not filled in. Faces are found in the browser (MediaPipe) for speaker photos. Either way the form is only pre-filled, with the imported fields marked; the admin checks it and saves a draft. Nothing is published automatically.
- **Copy:** casual, Hebrew first.
- **Brand:** tokens v0.1 in `brand/brand-tokens.md`, pending approval in the designer chat.

---

## 1. Sitemap

Hebrew is the default with no URL prefix (`/`). English lives under `/en/...` (next-intl `localePrefix: 'as-needed'`).

| Route | Who sees it | Milestone |
|---|---|---|
| `/` Home: hero, Next event card, season timeline | everyone | **1** |
| `/events/[slug]`: event page with date, venue, speakers, Luma, add to calendar | everyone | 1 (basic), 3 (content) |
| `/lectures`, `/lectures/[slug]`: speaker, company, public blurb. Full summary and takeaways for members only | public + members | 3 |
| `/workshops`, `/workshops/[slug]`: Zero to Hero pages | members | 3 |
| `/login`: Google sign-in | everyone | 2 |
| `/members-only`: "המועדון סגור לחברים בלבד" | non-allowlisted | 2 |
| `/profile` (own), `/members/[id]` | members | 2 |
| `/admin`: allowlist, events, speakers, content | admins | 2–3 |
| `/speaker/[token]`: private single-use contact and consent form | speaker holding the link | 2 |

Not in this plan: project teams, our own registration (Luma handles it), join requests.

## 2. Database + RLS (Supabase Postgres)

All content lives in the database. The design covers every milestone, and Milestone 1 only *creates* the tables it needs (marked ✱). Later milestones add tables without reshaping these.

### Content
- **cohorts** ✱: `id, slug ('02'), name_he, name_en, starts_on, ends_on`
- **venues** ✱: `id, name_he, name_en, address_he, address_en, maps_url`
- **speakers** ✱: `id, slug, name_he, name_en, company_he, company_en, role_he, role_en, bio_he, bio_en, photo_url`. No contact data in this table, ever.
- **events** ✱
  - Fields: `id, slug, cohort_id, kind (opening | lecture | workshop | joint | closing | other), series (e.g. 'zero-to-hero'), series_no, title_he, title_en, blurb_he, blurb_en, starts_at timestamptz, ends_at timestamptz, venue_id (null = TBD), venue_note_he/en ("off campus"), luma_url (nullable), is_tentative bool, status (draft | published), created_at, updated_at, updated_by`
  - Planned for the backlog: `og_image_url`, `checkin_code`.
- **event_speakers** ✱: `event_id, speaker_id, sort`
- **event_content** (M3): `event_id, locale, section (summary | takeaways | commands | exercises | resources | prep), body_md, visibility (public | members), status (draft | published), updated_by`. Summaries are written by people (the club's lecture-summary initiative) and pasted or uploaded by an admin. No AI generation on the site.

### People and access (M2)
- **members**
  - Fields: `id, full_name, role (member | admin), status ('active'), cohort_id, created_at`
  - `status` is what makes next year's join flow possible without a rewrite: we add `'pending'` and an `applications` table, and nothing else changes.
- **member_emails**: `email citext unique, member_id, is_primary`. This is the allowlist. Admins can add a secondary email. A CSV import (`email, full_name, role`) upserts into members + member_emails.
- **profiles**: `member_id, auth_user_id, photo_url, year, faculty, bio_he, bio_en, links jsonb`
- Helper functions (`security definer`, `stable`):
  - `current_member_id()`: matches the signed-in user's **verified** Google email against `member_emails`.
  - `is_member()` and `is_admin()`.
- First login creates the `profiles` row. A non-allowlisted email gets a session but `is_member()` is false, so the user is sent to `/members-only` and RLS returns nothing.

### Speaker contact (M2): privacy is enforced in the database
- **speaker_contacts**
  - Fields: `speaker_id pk, email, phone, linkedin_url, share_email, share_phone, share_linkedin, linkedin_public, consented_at, updated_at`
  - **RLS on and no grants to `anon`**. Members can't read the table directly either.
  - Reading goes through two `security definer` RPCs:
    - `public_speaker_links(speaker_id)` returns **only** `linkedin_url`, and only when `share_linkedin AND linkedin_public`.
    - `member_speaker_contact(speaker_id)` returns only the consented fields, and only if `is_member()`.
  - Removal: the speaker asks or an admin deletes it, which hard-deletes the row.
- **speaker_form_tokens**: `token_hash, speaker_id, expires_at, used_at`. The admin creates a link. The form submits through one RPC, `submit_speaker_contact(token, …)`, which checks the hash, expiry and that it hasn't been used, stores the fields and `consented_at = now()`, and marks the token used. The raw token is never stored.
- Contact data is only ever fetched on the server, inside member-only pages. It is never put in `generateMetadata`, OG tags, or any public route. QA will check this with the anon key.

### RLS summary
| Table | anon / non-member | member | admin |
|---|---|---|---|
| events, event_speakers, speakers, venues, cohorts | read `published` | read `published` | full |
| event_content | `visibility='public' AND published` (event published too) | + `members` | full |
| event_files (+ private bucket `event-files`) | none | read published (signed URLs) | full |
| members, member_emails | none | none (own via profile) | full |
| profiles | none | read all, write own | full |
| speaker_contacts, speaker_form_tokens | none | via RPC only | full |
| attendance | none | read own rows | read all; write only via `admin_import_attendance()` |
| attendance_imports (guest counts) | none | none | read; write via the same RPC |

### Attendance (M2, built: from Luma's CSV export)
- **attendance**: `event_id, member_id, status (registered | checked_in | no_show), checked_in_at, source ('luma_csv'), imported_at, imported_by`. One row per member per event; re-importing an event replaces its rows.
- **attendance_imports**: one row per event: `rows_total, guests_registered, guests_checked_in, imported_at, imported_by`. Numbers only: no guest's name or email is ever stored.
- **admin_import_attendance(event, rows, commit)**: previews (commit = false) or saves, in one transaction. Going but not checked in is a no-show once the event has ended, `registered` before.

### Lecture and workshop content (M3, built)
- **event_content**: one row per event per section (`blurb, summary, goals, takeaways` for lectures; `prep, summary, commands, exercises, resources` for workshops). Markdown `body_he` (source) and `body_en` (null = "Hebrew only for now"), `visibility (public | members)`, `status (draft | published)`.
- **event_files**: PDFs in the private `event-files` bucket (`<event slug>/<name>.pdf`). Storage RLS lets a member read an object only while a published row points at it.
- Pages: `/lectures` and `/lectures/[slug]` are public and ISR (speaker, date, the public blurb); the members-only sections load in a client island from `/api/events/[slug]/content` (no-store), so they are never in the cached HTML. `/workshops` and `/workshops/[slug]` are members only (dynamic). Markdown goes through a small built-in renderer that escapes everything (`src/lib/content/markdown.ts`), no npm package.
- Checks: `scripts/rls-m3-content.mjs` (db:check), `tests/m3` (`tests/playwright.m3.config.ts`).

### Backlog (designed, not built)
- `feedback(event_id, member_id, rating, comment, created_at)`
- `events.og_image_url`

## 3. Design direction (short version; details live in brand-tokens.md)
- **Surfaces:** near-black indigo (`#0B0A1F`, not `#000`), a faint grid echoing the logo, and one soft purple glow behind the hero. In the spirit of Raycast: depth from layered surfaces and hairline borders, not from shadows everywhere.
- **Purple:** `#8A2BFF` only for CTAs, focus and highlights. Accent text uses `#A970FF`, which passes AA. Body text is off-white `#CFC8F0` on dark, with lines of 60–75 characters.
- **Type:** Rubik for Hebrew and English (it's what the club PDFs use). Small pixel-style details (eyebrows, pixel blocks) tie back to the logo and are never used for content.
- **Motion:** in the spirit of anthropic.com, using motion.dev. Short fade plus 8–12px slide, ease-out, about 400–600ms, triggered on scroll.
  - Home has a staggered first-load intro: logo → headline → timeline.
  - The **Next event card is rendered on the server and is fully visible at first paint, never starting hidden**.
  - With `prefers-reduced-motion`, everything is static.
- **Home layout (mobile first):** hero with the logo and a one-line Hebrew pitch, then the Next event card, then a vertical timeline.
  - The timeline shows past events dimmed and marked "עבר", the next event highlighted, tentative events tagged "טנטטיבי", and unknown venues as "מיקום ייקבע".
- **Next event logic:** the first published event with `ends_at > now()`. It switches at 20:00 on the event day. Computed on the server, with the page revalidated every 5 minutes. Admin edits will revalidate it immediately from M2 on.
- **Add to Google Calendar:** a `calendar.google.com/calendar/render?action=TEMPLATE` link built from the event fields. The Luma button is hidden while `luma_url` is empty.

## 4. Milestone 1 plan (Nov 12 → 17)

| Day | Work | Owner |
|---|---|---|
| Nov 12–13 | Brand tokens approved. **You:** create the GitHub org `tau-ai-club`, the Supabase org + `tau-ai-club-dev` and `tau-ai-club-prod`, and sign in to Vercel. Scaffold Next.js + TS + Tailwind + shadcn + next-intl; `CLAUDE.md`, lint/typecheck hooks, git, first push. | you, builder |
| Nov 13–14 | Migration for the ✱ tables and M1 RLS, seed the season into dev, Tailwind theme from the tokens, layout shell (header, language switch, footer) in RTL and LTR. | builder, designer |
| Nov 14–15 | Home: hero, Next event card, timeline. Then the event page `/events/[slug]` (basic). | builder, designer |
| Nov 16 | Motion pass, copy pass in Hebrew and English, `HANDOVER.md` v1. | designer, builder |
| Nov 16–17 | QA run from `qa/TEST-PLAN.md` on the Vercel preview. Fix. Promote to production, seed prod, QA on prod. | qa, builder |

Done means it's live on `https://tauaiclub.com` (with `tau-ai-club.vercel.app` as fallback), both languages, desktop and mobile, the QA checklist is green, and there's no Vercel toolbar on production.

### Seed data (all editable later; ⚠ = tentative or TBD)
| Date | Event | Speaker | Venue |
|---|---|---|---|
| Wed 11.11.2026 | Opening (past) | Shai Yahel | Broadcom Hall |
| Wed 18.11 | Zero to Hero 1: Claude | Oz | on campus ⚠ exact room |
| Wed 25.11 | Zero to Hero 2: Claude | Oz | Entrepreneurship Center |
| Wed 2.12 | Entrepreneurship & Tech | Or Maccabi | MongoDB offices |
| Wed 16.12 | Zero to Hero 3: Claude | Oz | off campus ⚠ TBD |
| Wed 23.12 | Entrepreneurship & Tech | Roee Margalit | ⚠ TBD |
| Wed 30.12 | Growth / Capital | Tomer Diari | Aleph offices |
| Sun 3.1.2027 | Joint event ⚠ tentative | Ori Goshen | Broadcom Hall |
| Wed 6.1.2027 | Closing: Corporate, with Google | — | ⚠ TBD |

Workshop prep (shown on Zero to Hero events): Claude Code installed, Pro plan, bring a laptop.

## 5. Open questions
1. **GitHub repo visibility.** Vercel Hobby can't deploy a *private* repo owned by an org. Options: (a) a **public** repo in `tau-ai-club` (fine, since there are no secrets in code), or (b) private under your personal account for now, moved to the org at handover. **Recommendation: (a).**
2. Hebrew spellings for speakers and venues: you said they're coming. Until then I'll seed my best transliteration and mark it for review.
3. Is the 3.1 joint event really on a Sunday? Every other event is on a Wednesday.
4. Who is "Oz"? I need a full name and company for the speaker card.
