# Work board

The manager keeps this current. One line per task. An agent only works on a task that's on this
board with its name, and only touches the files listed for it. When a task is merged, it moves
to "Done (last 2 weeks)".

## In progress

| Task | Agent | Files claimed | Branch | Status |
|---|---|---|---|---|
| Add to home screen: mockups to choose from (icon on the phone, how it opens, a hint in /me if needed) | tau-designer | `design/home-screen/**` (new) | agent/design | Started 19.11 |
| One command for all checks + own ports per worktree | tau-qa | `tests/**`, `playwright.config.ts` | agent/qa | Started 19.11 |
| Club-list leak (privacy H1): Supabase Auth must give the same answer for listed and unlisted emails, and send codes only to listed ones | tau-auth | `supabase/migrations/**` (new file), Supabase Auth hooks/settings, `src/lib/auth/**` if needed | agent/auth | Started 19.11 |

## Waiting for the user

| Task | What we're waiting for |
|---|---|
| Is the schedule public? | The club owners (`docs/OPEN-QUESTIONS.md` #1) |
| Luma links, venues for 16.12 / 23.12 / 6.1, announcement to members | The club (`docs/OPEN-QUESTIONS.md` #2) |
| Reyymark logo | A logo file from the user |

## Done (last 2 weeks)

| Date | Task | Commit |
|---|---|---|
| 19.11 | Privacy check (tau-privacy, read only): RLS, code, git and guest site clean; 1 high (club-list leak), 2 medium | report in manager notes |
| 18.11 | Personal area: new order, details fold behind an edit button, my attendance moved in, /profile forwards to /me | `4b98d47` |
| 18.11 | Profile photos: any phone photo works (shrunk in the browser) | `a4f60fd` |
| 18.11 | Header tabs get a thin frame (option 1) | `19cf9d2` |
| 18.11 | Colours option 3, home backdrop in /me, tap bar, server moved to Frankfurt | `da44075` |
