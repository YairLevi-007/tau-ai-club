# Work board

The manager keeps this current. One line per task. An agent only works on a task that's on this
board with its name, and only touches the files listed for it. When a task is merged, it moves
to "Done (last 2 weeks)".

## In progress

| Task | Agent | Files claimed | Branch | Status |
|---|---|---|---|---|
| Club-list leak (privacy H1): code done (`7686964`); tau-security reviews it before the merge. Then the user turns on CAPTCHA in Supabase (dev, then prod) | tau-auth | `src/app/api/auth/otp/route.ts`, `src/lib/auth/otp.ts` | agent/auth | In review |
| One command for all checks (`tests/run-all.mjs`), the flaky forged-JWT test, the title-comma test | tau-qa | `tests/**` | agent/qa | Done on the branch, to merge next |

## Waiting for the user

| Task | What we're waiting for |
|---|---|
| Is the schedule public? | The club owners (`docs/OPEN-QUESTIONS.md` #1) |
| Luma links, venues for 16.12 / 23.12 / 6.1, announcement to members | The club (`docs/OPEN-QUESTIONS.md` #2) |
| Reyymark logo | A logo file from the user |

## Done (last 2 weeks)

| Date | Task | Commit |
|---|---|---|
| 19.11 | Live: new home page (items 3–8), members' next meetup on home (item 5), lectures, workshops, the event page and member pages in the /me look, /me items 9–10 (next above the dial), title flips fixed, round 2 (English line, 44px taps, admin on phones, members rows), and the home-screen icon + launch screens (no card) | `15668ae` |
| 19.11 | Privacy check (tau-privacy, read only): RLS, code, git and guest site clean; 1 high (club-list leak), 2 medium | report in manager notes |
| 18.11 | Personal area: new order, details fold behind an edit button, my attendance moved in, /profile forwards to /me | `4b98d47` |
| 18.11 | Profile photos: any phone photo works (shrunk in the browser) | `a4f60fd` |
| 18.11 | Header tabs get a thin frame (option 1) | `19cf9d2` |
| 18.11 | Colours option 3, home backdrop in /me, tap bar, server moved to Frankfurt | `da44075` |
