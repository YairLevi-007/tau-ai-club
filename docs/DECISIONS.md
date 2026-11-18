# Decisions the user approved

**Every agent reads this before starting work.** Everything here was approved by the user.
Don't change, replace or "improve" any of it without asking the user first (through the manager).
If a task seems to need a change here, stop and ask.

**The manager keeps this file current.** When the user approves something, the manager adds a line here
in the same step it's applied (before or with the commit, not later), and tells every agent whose area
it touches. A decision made in a chat, in a dashboard (Supabase, Vercel) or in a mockup folder outside
the repo isn't finished until it's written here.

Open questions (not decided yet) live in `docs/OPEN-QUESTIONS.md`.

| Date | Decision | Area | Where it lives |
|---|---|---|---|
| 18.11 | **Login code email: the dark, club-style design.** The user chose it over a light phone variant. Subject: `קוד הכניסה שלך למועדון ה-AI · Your TAU AI Club code`. | Design, auth | `design/email/code-email.html` (+ `.png`), HANDOVER G4. Live in Supabase → Email Templates → Magic link + Confirm sign up. |
| 18.11 | No public sign-up. Guests see only a "כניסה לחברים" button. Login is a 6-digit email code, only for emails on the club list. | Auth, design | `src/app/api/auth/*`, `hook_before_user_created` |
| 18.11 | The schedule (dates, times, places) is for members only **for now**. Guests see the vision, speakers (no dates) and founders. Meetup pages and calendar files are members only. Stopgap: still an open question for the club. | Home, events | `docs/OPEN-QUESTIONS.md` #1, `showSchedule`, `src/lib/calendar-access.ts` |
| 18.11 | No "במחזור?" card on the home page. The header's "כניסה לחברים" is the only way in. | Home | `src/app/[locale]/page.tsx` |
| 18.11 | Meeting games: built by another team. Only in the personal area (/me), not on the public home page. Design: **the big card with the two seats** (option 3 of 3), title "משחקי היכרות לחברי המועדון" and the 1:1 text. | /me | `IcebreakersTeaser` (embedded) in `src/app/[locale]/me/page.tsx` |
| 18.11 | **The season dial (speakers around the season) is in the personal area** (place: see the order row). Off the public home page while the schedule is members only. | /me | `SeasonTimeline` (embedded) |
| 18.11 | **Personal area order** (same design, only the order): 1. "שלום, {full name}" + the member's details to fill in (the /profile editor, right there), 2. "קורה היום" only on a meetup day, 3. the season dial, 4. upcoming meetups + add to Google Calendar, 5. lectures, workshops and the meeting games card at the bottom. | /me | `src/app/[locale]/me/page.tsx`, `ProfileEditor` |
| 18.11 | Personal area fields: name, photo, description, faculty, degree, year, LinkedIn, phone, Gmail. Phone and Gmail have "show to members" toggles, **default off**. | /me, /profile, DB | `member_contacts` + RPCs |
| 18.11 | Luma stays manual: a Luma link per event, plus a CSV upload after each meetup. | Admin | `/admin/events`, `/admin/attendance` |
| 18.11 | **Company logos on speaker and founder photos**, not a black letter. Each logo in its own colours on a small white square. Stealth startup: the purple padlock from its logo, on dark. Rotate · Check Point shows Check Point. A company with no logo file (Reyymark for now) keeps its initial. | Design, home | `src/lib/company-logos.ts`, `public/companies/` |
| 18.11 | **Site colours: option 3 of 3.** Cards on the home page and in the personal area are purple-raised (`--bg-raised` with a purple border), with soft purple glows down the page. The personal area (/me, /profile) has the same backdrop as the home hero (logo grid, glow, pixel blocks). | Design, home, /me | `raisedPanelClass`, `PageBackdrop`, body glows in `src/app/globals.css` |
| 18.11 | **Header tabs (Lectures, Workshops): a thin light frame on each tab** (option 1 of 3), white text, purple frame on hover, so it's clear they can be tapped. | Design, header | `navLinkClass` in `src/components/site/site-header.tsx` |
| 18.11 | Phones: 44px tap targets site-wide (header included), fields at 16px. The admin attendance grid stays dense. | Design | `src/app/globals.css` |
| 18.11 | Speaker and founder roles stay in English on both languages. Speaker photos only from the club's flyers. | Content | `supabase/seed.sql` |
| 17.11 | Lecture summaries are written by people and published as given (no AI summaries, no proofreading). | Content | `docs/PLAN.md` |
| 16.11 | Brand tokens are frozen (v1.1). Changes need the user's OK. | Design | `src/app/tokens.css` |
| — | No Claude tokens or paid AI APIs on the site. | All | |
