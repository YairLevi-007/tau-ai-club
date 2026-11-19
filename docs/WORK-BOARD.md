# Work board

The manager keeps this current. One line per task. An agent only works on a task that's on this
board with its name, and only touches the files listed for it. When a task is merged, it moves
to "Done (last 2 weeks)".

## In progress

| Task | Agent | Files claimed | Branch | Status |
|---|---|---|---|---|
| Add to home screen: mockups to choose from (icon on the phone, how it opens, a hint in /me if needed) | tau-designer | `design/home-screen/**` (new) | agent/design | Started 19.11 |
| One command for all checks + own ports per worktree | tau-qa | `tests/**`, `playwright.config.ts` | agent/qa | Started 19.11 |
| Privacy check: member phones and emails on the live site and in Supabase RLS (read only) | tau-privacy | none (reads only; report goes in the manager's notes folder) | — | Started 19.11 |

## Waiting for the user

| Task | What we're waiting for |
|---|---|
| Is the schedule public? | The club owners (`docs/OPEN-QUESTIONS.md` #1) |
| Luma links, venues for 16.12 / 23.12 / 6.1, announcement to members | The club (`docs/OPEN-QUESTIONS.md` #2) |
| Reyymark logo | A logo file from the user |

## Done (last 2 weeks)

| Date | Task | Commit |
|---|---|---|
| 18.11 | Personal area: new order, details fold behind an edit button, my attendance moved in, /profile forwards to /me | `4b98d47` |
| 18.11 | Profile photos: any phone photo works (shrunk in the browser) | `a4f60fd` |
| 18.11 | Header tabs get a thin frame (option 1) | `19cf9d2` |
| 18.11 | Colours option 3, home backdrop in /me, tap bar, server moved to Frankfurt | `da44075` |
