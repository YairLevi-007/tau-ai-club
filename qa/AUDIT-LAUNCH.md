# QA gate: members launch (`launch/members` @ 2bb311c)

Tested on a frozen `git archive` of 2bb311c (5 commits on top of aa7cb05), production builds (`next build` + `next start`), not the dev server. Nothing here was tested against a real Supabase project.

| Build | Env |
|---|---|
| **off** (production as deployed) | `VERCEL_ENV=production DATA_SOURCE=seed NEXT_PUBLIC_SITE_URL=https://tauaiclub.com`, no Supabase, no `AUTH_ENABLED` |
| **on** (stub) | `AUTH_ENABLED=true`, `USE_FIXTURES=1`, `SUPABASE_SECRET_KEY` set, `NEXT_PUBLIC_SUPABASE_URL` pointing at a QA stub (Auth OTP/verify/user + the RPCs the pages call; code is always 123456) |

## Verdict

**Safe to merge to `main` today (auth off): no must-fix.** Before `AUTH_ENABLED=true` goes on in production there is **one must-verify item (M1)**: a missing grant that can make the sign-up hook fail on real Supabase.

## Must-fix / must-verify before turning auth on

**M1. Auth hook may fail with "permission denied for schema public".** `20261119000000_members_launch.sql` grants `EXECUTE` on `hook_before_user_created` to `supabase_auth_admin` but never `grant usage on schema public to supabase_auth_admin`, which Supabase's hook documentation lists as part of the setup. `scripts/check-db.mjs` creates that role in its own stub and grants the usage itself, so `pnpm db:check` cannot catch it (my check `L6` in `tests/db/launch-rls.qa.mjs` fails on exactly this). If the grant is missing on the real project, every first login (hook runs on user creation) errors out, for listed members too. Fix: add `grant usage on schema public to supabase_auth_admin;` to the migration (idempotent, harmless), and in runbook G5 do one real first-login on `tau-ai-club-dev` before prod.

## Should-fix

- **S1. Privacy note promises something the database doesn't do.** `profile.privacyNote` says club admins "always see phone and email". Admins have no grant on `member_contacts`, and `member_contact()` shows an admin only what the member shares (tested: admin sees two NULLs when sharing is off). The copy overpromises. Either reword ("admins can see them in the database") or add an admin-only RPC. The behaviour that exists is the safer one.
- **S2. Login throttle is per server instance, in memory.** On Vercel each warm instance has its own buckets and a cold start resets them, so it is a soft limit; Supabase's own per-email/IP limits are the real backstop (HANDOVER already says so). It also lets anyone lock a known member out for 10 min: 3 `/api/auth/otp` calls block that email's code requests, and a forged `tau_otp_email` cookie on `/api/auth/verify` burns the 6 verify tries. Low severity; accept or move to the DB/Supabase limits.
- **S3. Members see padlocks.** After login the header still shows a lock icon next to Lectures/Workshops (`member-nav.tsx`), which reads as "locked" to the person who can open them. Show the lock only for the guest preview.
- **S4. Allowlist lookup puts the email in a server-to-Supabase query string** (`/rest/v1/member_emails?email=eq.<email>`). Never visible to the browser (checked: no email in any URL the browser touched, in `Location` headers, cookies' paths, or the page), but it ends up in Supabase API logs. An RPC (POST body) would avoid it.
- **S5. Profile save is not atomic.** `saveProfile` updates `profiles` first, then `update_my_contact`; an invalid phone shows an error after the rest was already saved.

## Pass, with evidence

**1. Production config, auth off (what a visitor sees).** All 51 paths x HTML+RSC: 200, no 5xx.
- Home `/` and `/en`: new "About" section, cohort band ("Not in the cohort? Follow us…" with Instagram/LinkedIn). **No login button anywhere** (header has Lectures, Workshops with lock, Instagram, LinkedIn, language switch). 0 links to `/login` in the page source.
- `/login`, `/me`, `/profile`, `/admin`, `/welcome`, `/members-only`, `/members/<id>`, `/speaker/x`: the calm "Soon / בקרוב" page, **200, `noindex`**, same URL, he and en. Nothing broken, no redirect loops.
- `/lectures` and the 6 lecture pages: **still the public preview as at aa7cb05** (blurb, speaker, date; indexable; members-only write-up replaced by "members only, soon"). Listed in the sitemap. `/workshops/*`: "members only, soon", `noindex`. This is the same as what is live now, so acceptable.
- Sitemap: 34 URLs on `https://tauaiclub.com`, no auth-area URL; 14 lecture URLs, 0 workshops.

**2. Auth on (stub).** 55 checks, all intended behaviour passes:
- Guests: `/lectures`, `/lectures/<slug>`, `/workshops`, `/workshops/<slug>`, `/me`, `/profile`, `/admin/members`, he and en, get 307 to `/[en/]login?next=<path>`; no page body in the redirect. `/api/events/<slug>/content` returns `{"viewer":"guest","sections":[],"files":[]}`; speaker-contacts `{"contacts":{}}`; `/api/files/<id>` 403.
- Guest header: purple "Member log in", no Lectures/Workshops. With auth on, sitemap has no lectures/workshops/auth URLs, and lecture pages are `noindex`.
- Email step: an unlisted and a listed address get the **identical** neutral screen (`code-sent`); an unlisted address never reaches Supabase (0 `/auth/v1/otp` calls), a listed one exactly 1. Wrong code: error in `role=alert`, stays on code step. Right code (with spaces) works.
- **No email in any URL** (browser requests, redirects, final URLs); email lives in an HttpOnly `tau_otp_email` cookie (Path `/api/auth`) cleared after verifying. Session cookies HttpOnly; `tau_member` is a non-HttpOnly UI hint only.
- Redirect back: first login `/en/login?next=/lectures` -> `/en/welcome?next=…` -> Continue -> `/en/lectures`. Returning member with no `next` -> `/me`. Sign-out then blocks `/en/lectures` again.
- Throttle: 4th code request for one email in 10 min -> `error=throttled`; wrong-code guesses throttled after 6. Cross-origin POST 403; `next=//evil.example` neutralised; `GET /api/auth/otp` 405; login pages `no-store`, `X-Frame-Options: DENY`.
- A plain member gets 404 on `/en/admin/members`. No console errors across the member session. Member views `/lectures`, `/workshops`, `/me` (per-event `.ics` links point at the public endpoint), `/profile`.
- Not testable here (no real project): real mail delivery, real Supabase OTP expiry/rate limits, signed-in outsider and admin pages, storage.

**3. Privacy.**
- `pnpm db:check`: all checks pass. My independent `tests/db/launch-rls.qa.mjs`: **97/98** (the one failure is M1). Covers: `member_contacts` closed to anon/outsider/member/admin for select/insert/update/delete/truncate; RLS on; no value of any save reaches `profiles`, `member_directory()`, `member_profile()`, `members`, `current_member()`, `events`; defaults both OFF; each toggle independent; unverified-email twin, secondary email and case variants resolve correctly; phone/email validation (script tags, injection strings, newline, length); admin sees nothing private through the RPC; `program` limits; every SECURITY DEFINER function pins `search_path`; the new functions are not executable by anon. The hook: allows listed (any case, secondary email, padded), rejects 9 hostile/near-miss emails, empty, no user, array email; anon/authenticated cannot call it; a deleted member is rejected afterwards.
- Pages: no phone, `tel:`, `mailto:` or email address in the HTML or RSC of any of the 51 paths, both builds; no members-only seed text (61 canaries) in HTML, RSC or the 26 client JS chunks; JS has no contact column names. `fixtures.json`: 0 phones/emails. Sitemap, `calendar.ics`, `calendar-en.ics`, `/api/calendar/<slug>` (public fields only): clean.
- Git: scanned the branch diff and the whole history (`git log --all -p`) for phones/emails and compared against every email, phone and name in `tau-ai-club-private/members-cohort-02-import.sql` (counts only, values not printed). **0 member emails or phones** anywhere in git. The only name matches are public founders/speakers (seed, fixtures) and the recruiting-post text under `brand/`. The only xlsx/csv ever committed is the synthetic `attendance-sample.csv`. `.gitignore` covers luma exports; the script refuses an output path inside the repo.

**4. Accessibility, RTL, Hebrew.** axe (wcag2a/aa/21/22aa) **0 violations** on `/`, `/en`, `/login`, `/me`, `/members-only` (he/en, 390/1440, auth on and off) plus `/profile`, the code step and `/lectures`; no horizontal overflow, `lang`/`dir` correct, no console errors. Hebrew login/code/me/profile screens read in plural or neutral forms ("שלחו לי קוד", "בדקו", "הוסיפו", "להשלים", "הפרופיל שלך"); no singular gendered imperatives found. Nit: native file input says "No file chosen / Choose File" in English on the Hebrew page (browser-controlled).

**5. Lighthouse, home, median of 3, same machine, production builds (vs aa7cb05 baseline).**

| | M1 audit (qa/AUDIT-M1.md) | aa7cb05 now | launch 2bb311c |
|---|---|---|---|
| Mobile he: LCP / TBT / perf | 3.4 s / 400 ms / 82 | 0.91 s / 27 ms / 100 | **0.91 s / 25 ms / 100** |
| Mobile en | 3.3 s / 240 ms / 88 | 0.91 s / 22 ms / 100 | **0.91 s / 20 ms / 100** |
| Desktop he/en | 0.7-0.8 s / 0 / 100 | 0.25 s / 0 / 100 | **0.25 s / 0 / 100** |
| Transfer (mobile he) | 338 KiB | 439 KiB | 435 KiB |

CLS 0, accessibility/best-practices/SEO 100 everywhere. No regression from the launch commits. (Throttled lab numbers; re-check on the deployed URL.)

## Notes for the team
- `tests/db/launch-rls.qa.mjs` is my new RLS test; it is **not committed** (this task allowed only this file on the branch). Say if you want it committed on `launch/members` or `main`.
- Supabase checklist items from the runbook that I could not verify and that decide the launch: custom SMTP (the built-in mailer only reaches team addresses), the **Magic Link and Confirm signup** templates both carrying `{{ .Token }}`, Email OTP length 6, the hook registered, and M1.
