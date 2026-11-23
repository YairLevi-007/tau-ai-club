# pAIr on the club site

pAIr pairs cohort members for a short 1:1 (or 3-person) chat at each meetup, and tracks who has met whom.
Yair Levi owns it. This page says which files are his, which site pieces he can rely on, and what needs asking first.

The aim: a pAIr PR touches only pAIr files, so it can be merged with little or no work.

## Your files

Change these freely in a PR.

| Where | What |
|---|---|
| `src/lib/pair/` | Logic and data: `match.ts` (making groups, history, repeats), `common.ts` (what members have in common), `confirm-state.ts`, `data.ts` (queries), `me-actions.ts` (the member's "we met" server action) |
| `src/components/pair/` | UI: `icebreakers-teaser.tsx` (the card on /me), `confirm-meet.tsx`, `pair-bits.tsx`, `pair-matrix.tsx`, `people-picker.tsx`, `copy-text-button.tsx` |
| `src/app/[locale]/admin/pair/` | The admin pages (`page.tsx`, `[eventId]/page.tsx`, `matrix/page.tsx`) and their server actions (`actions.ts`). They live here because Next.js routes come from folders. |
| `messages/{he,en}.json`, the `"pair"` object | All pAIr text. Keep both files with the same keys. |
| `tests/m3/pair.spec.ts` | pAIr's tests |

Three of these files are the doorway to the rest of the site (next section): `site.ts`, `site-ui.ts` and `site-nav.ts`. Don't import site code from anywhere else.

## Site pieces you can rely on

pAIr files import site code (`@/…` outside pAIr's folders, or a relative path out of them) **only** through the three doorway files. A test (`tests/m3/pair-boundary.spec.ts`) fails the PR otherwise. Packages (React, next-intl, lucide-react and so on) are fine to import directly.

### `src/lib/pair/site.ts` (server only)

| Name | What it gives you |
|---|---|
| `getViewer()` | Who is looking: `kind` is `"guest"`, `"outsider"` (signed in, not on the member list) or `"member"` (with `member.id` and `member.role`, which is `"admin"` for admins). Use it for member checks. It reads cookies, so only on member and admin pages. |
| `requireAdmin(path)` | First line of every admin page (`path` is where to come back after log-in). Guests go to log-in, outsiders to "members only", members who aren't admins get a 404. |
| `createClient()` | The signed-in user's Supabase client. RLS decides what it can read. Returns `null` when Supabase isn't set up. |
| `adminClient()` | First line of every admin server action: returns the admin's Supabase client, or throws if the caller isn't an admin. |
| `currentCohort(supabase)` | The current cohort (members are listed per cohort). |
| `signPhotos(supabase, urls)` | Turns stored profile photo paths into short-lived signed URLs. |
| `str(formData, key)` | Reads a string field from a form. |
| `type ProfileLinks` | The public link fields on a member profile (LinkedIn and so on). |

### `src/components/pair/site-nav.ts` (safe in client components too)

| Name | What it gives you |
|---|---|
| `Link`, `redirect` | Locale-aware navigation. Write `/admin/pair`, not `/en/admin/pair`. |

It's a separate file because next-intl's navigation only loads inside Next.js. Keeping it out of `site-ui.ts` lets the tests render pure pAIr pieces (like `PairMatrix`) in plain Node.

### `src/components/pair/site-ui.ts` (safe in client components too)

| Name | What it gives you |
|---|---|
| `TIME_ZONE`, `type Locale` | Always show times in Israel time: `TIME_ZONE` is `Asia/Jerusalem`. `Locale` is `"he" \| "en"`. |
| `formatShortDate`, `loc` | Dates in Israel time; `loc(row, "title", locale)` reads `title_he`/`title_en` with a fallback. |
| `cn` | Joins class names. |
| `panelClass`, `panelTitle`, `hintClass`, `inputClass`, `smallBtn`, `dangerBtn` | The admin area's shared styles. |
| `AdminHeader`, `ActionForm`, `type ActionState` | The admin page header, and the form wrapper that shows a server action's result. |
| `BidiText` | Mixed Hebrew/English text that keeps numbers and Latin words in order. |
| `MemberAvatar`, `ProfileSubline`, `LinkedInIcon`, `FlyerChip` | Member photo or initials, the "year · faculty · program" line, the LinkedIn mark, and the small chip used on cards. |

If one of these changes in the site, the site keeps the name and the meaning the same, or updates pAIr in the same PR.

### Where pAIr appears on the site

The site uses only two pAIr entry points. Keep their names and props stable; tell us before changing them.

- `getMyMatches(supabase)` and `type MyMatch` from `src/lib/pair/data.ts`, used by `/me` (`src/app/[locale]/me/page.tsx`).
- `<IcebreakersTeaser …/>` from `src/components/pair/icebreakers-teaser.tsx`, the card on `/me`.

Plus the admin menu's tab to `/admin/pair` ("1:1 chats", in `src/app/[locale]/admin/layout.tsx`, text key `admin.pairTab`).

### Text, design and data

- **Text.** The `"pair"` object in `messages/he.json` and `messages/en.json` is yours. The /me card also reads `home.icebreakersSoon`, `home.icebreakersTitle`, `home.icebreakersBody` and `profile.yearN`. Use them, but ask before changing them, since other pages use them.
- **Hebrew and English.** Hebrew is the default and right-to-left. Use logical classes only: `ms-/me-/ps-/pe-/start-/end-/text-start`, never `ml-/mr-/pl-/pr-/left-/right-/text-left`. Put numbers, times and Latin text inside Hebrew in `<bdi>` (or use `BidiText`).
- **Design.** Use the site's Tailwind tokens (`bg-bg`, `text-fg`, `text-fg-muted`, `text-fg-subtle`, `border-border`, `text-brand-purple-soft`, `btn btn-primary`, `rounded-lg`, `font-mono`). No raw colours (`#…`) in components. Purple is for buttons, focus and highlights. Check every screen at 390px wide (phone) and 1440px: no sideways page scroll.
- **Data.** Read pAIr's tables (`pair_rounds`, `pair_round_people`, `pair_groups`, `pair_group_members`, `pair_confirms`) and call its RPCs (`my_pair_matches`, `confirm_my_pair`, the `admin_pair_*` functions) only through `createClient()`/`adminClient()`. RLS is the security boundary; the UI isn't.

## Ask first (these go through the manager and security review)

Don't change these in a pAIr PR. Open an issue or ask, and we'll do it with a security review.

- **Database:** tables, columns, RPCs, grants and RLS policies. pAIr's schema is in `supabase/migrations/20261122000000_pair_icebreakers.sql`. Applied migrations are never edited; a change is a new migration file. `scripts/rls-pair.mjs` holds pAIr's RLS checks.
- **Auth and member checks:** `src/lib/auth/`, `src/proxy.ts`, `src/lib/supabase/`, who counts as a member or admin.
- **Anything outside pAIr's files above.** If you need something new from the site, add a re-export to the right doorway file and say so in the PR (or ask us to). Removing or renaming a doorway export needs asking.
- **package.json, the lockfile, `next.config.ts`.** New packages need asking.
- Member data: never show a member's email or phone, and never use real member data in tests or screenshots.

## Before you open a PR

Setup once: Node 22+, then `pnpm install` (pnpm is pinned in package.json; `npx pnpm@12.18.0 install` also works).

1. Fast checks while working:
   ```
   pnpm check
   PW_M3_PORT=3741 npx playwright test -c tests/playwright.m3.config.ts tests/m3/pair.spec.ts tests/m3/pair-boundary.spec.ts
   ```
   `pnpm check` is TypeScript and ESLint. The second line builds the site and runs pAIr's tests (no Supabase needed).
2. The full suite, once, before the PR:
   ```
   node tests/run-all.mjs
   ```
   It runs the database checks (`pnpm db:check`, in-memory Postgres, including pAIr's RLS checks), TypeScript, ESLint and every browser test. It takes a while, and longer when the machine is busy, so close other dev servers first. `node tests/run-all.mjs --only=db,m3` runs just the database checks and the members-area tests.
3. If you changed what anyone sees: screenshots in Hebrew and English, at 390 and 1440, in the PR.

To look at pAIr locally with sample data, `pnpm dev:fixtures` runs the site without Supabase; the members area needs a real or mocked Supabase (ask, and we'll share the mock we use).
