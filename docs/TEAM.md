# The team: who does what

The user set this up on 19.11. Every agent reads this, `docs/DECISIONS.md` and
`docs/WORK-BOARD.md` before starting any task.

## The manager (tau-manager)

The user talks to the manager. The manager:

- **Hands out the work.** Every task goes to the agent whose lane it is, and gets a line on `docs/WORK-BOARD.md` first.
- **Keeps agents from getting in each other's way.** Two agents may work at the same time, but never on the same files.
- **Merges.** Only the manager merges into `main` and pushes. Before that, all three test suites pass and the manager reads the diff. Vercel deploys `main` automatically.
- **Writes decisions down.** Every approval from the user goes into `docs/DECISIONS.md` straight away, and every agent it touches is told about it.
- **Reports.** A short report to the user, in Hebrew: what's done, what's in progress, and what's waiting for the user.
- **Suggests improvements.** Once a week, 3 suggestions to make the site and the work better (UX, speed, simpler code, a smoother way of working). The user picks what to do. Nothing gets built without the user's OK.
- **Checks the result.** Before telling the user that something is up, the manager checks it on the live site (tauaiclub.com).

## The agents and their lanes

| Agent | Lane | Owns (may change) | Doesn't touch |
|---|---|---|---|
| **tau-designer** | Look and feel, UX, copy layout, mockups | `src/app/globals.css`, `src/app/tokens.css` (frozen: tokens only with the user's OK), `src/components/**` visual markup, `design/**`, `messages/*.json` wording | Data, auth, DB, API routes |
| **tau-builder** | Pages, features, data | `src/app/[locale]/**` pages, `src/lib/**` (not auth), `src/components/**` logic, `supabase/seed.sql` | Auth flow, RLS, emails |
| **tau-auth** | Sign-in, members, permissions, emails | `src/app/api/auth/**`, `src/lib/auth/**`, `src/lib/supabase/**`, `supabase/migrations/**`, RLS, Supabase email templates | Page design |
| **tau-qa** | Tests and checks | `tests/**` only | All app code. Reports bugs to the manager instead of fixing them |
| **tau-content** (new) | Club content and operations: meetups, speakers, Luma links, attendance CSVs, summaries | Content through the admin pages, `supabase/seed.sql` content rows, `docs/OPEN-QUESTIONS.md` | Code. Asks the manager when content needs a code change |
| **tau-privacy** (new, reads only) | Security and privacy of member data: phones, emails, RLS, what guests can see | Nothing. Writes a report to the manager | Everything (reads only) |

A task that crosses lanes (e.g. a new page with a new DB column) is split by the manager: auth does the DB part, builder the page, designer the look, in that order. Each part is its own line on the board.

## How agents work together without breaking each other's work

1. **Each agent has its own copy of the code** (a git worktree) on its own branch, cut from `main`:

   | Agent | Folder | Branch |
   |---|---|---|
   | manager | `C:\Users\zieri\Documents\Projects\tau-ai-club-m3` | `launch/members` = `main` (merge point) |
   | designer | `…\Projects\tau-ai-club-design` | `agent/design` |
   | builder | `…\Projects\tau-ai-club-build` | `agent/build` |
   | auth | `…\Projects\tau-ai-club-auth` | `agent/auth` |
   | qa | `…\Projects\tau-ai-club-qa` | `agent/qa` |

   tau-content and tau-privacy don't need a folder: they work through the admin pages or only read.
2. **Claim before you start.** The manager writes the task on `docs/WORK-BOARD.md` with the agent and the files. Files that another task in progress has claimed are off limits until that task is merged.
3. **Never delete or rewrite someone else's code.** If something in another lane is in the way, stop and tell the manager.
4. **Before handing in:** `git pull` the latest `main` into your branch, run `tsc`, `eslint` and the tests for your area, then commit on your branch and tell the manager: what changed, which files, and how you checked it. Don't push to `main`.
5. **Never push to `main`, never force-push, never `git reset --hard` a shared branch.**
6. **Tests run one suite at a time** (they share ports). m3 uses `PW_M3_PORT=3741`.

## Rules that always apply

- `docs/DECISIONS.md` wins over any other doc or mockup.
- No secrets in chat or in git. The member list stays in `tau-ai-club-private`.
- No paid AI or Claude tokens on the site.
- Answer the user in Hebrew, in short plain words.
