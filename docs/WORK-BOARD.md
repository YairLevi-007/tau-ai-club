# Work board

The manager keeps this current. One line per task. An agent only works on a task that's on this
board with its name, and only touches the files listed for it. When a task is merged, it moves
to "Done (last 2 weeks)".

## In progress

| Task | Agent | Files claimed | Branch | Status |
|---|---|---|---|---|
| Add to home screen, part 1: wiring (web manifest, opens on /me, the /me card's logic: phone + browser only, iPhone explainer, Android install prompt, dismiss) | tau-builder | `src/app/manifest.ts` (new), `src/app/[locale]/me/page.tsx`, new component under `src/components/members/` (logic), `src/app/[locale]/layout.tsx` (head tags only) | agent/build | Started 19.11 |
| Design review of every page (home, /me, lectures, workshops): screenshots + a list of improvements per area, reads only. Building waits for the user's picks | tau-designer | `design/review/**` (report and screenshots only) | agent/design | Started 19.11 |
| Design review item 1: mixed Hebrew/English titles flip (",Claude Code"). A display helper, Hebrew only, not inside `loc()` (admin forms must not save the mark) | tau-builder | `src/lib/event-format.ts`, title spots in `src/app/[locale]/events/[slug]/**`, `lectures/**`, `workshops/**`, `me/page.tsx`, `src/components/events/next-event-card.tsx`, `season-timeline.tsx`, `src/components/members/my-attendance.tsx` | agent/build | Started 19.11 |
| Design review item 2: card consistency (lecture vs workshop cards) and one avatar shape | tau-designer | card and avatar components (`src/components/**`, visual only), `globals.css`. Not the files item 1 claims; if a page file is needed, it waits for item 1 | agent/design | Started 19.11 (user: "1 and 2 first") |
| Design review items 3, 4, 6, 7, 8: home page look (visual markup only) | tau-designer | `src/app/[locale]/page.tsx`, home-only components (not `next-event-card.tsx`), `messages/*.json` | agent/design | After items 1 and 2 |
| Design review items 11–13: lectures and workshops pages | tau-designer | `lectures/**`, `workshops/**` (visual only) | agent/design | After items 1 and 2 |
| Design review item 5, part 1: "next meetup" card on home for signed-in members only (data and logic; no schedule in public HTML, home stays ISR for guests) | tau-builder | `src/app/[locale]/page.tsx` (the card's spot only), a new members-only route or component under `src/app/api/**` or `src/components/events/**` (logic) | agent/build | Started 19.11. tau-security checks it before the merge |
| Design review item 5, part 2: the card's look on home | tau-designer | visual markup of the card on home | agent/design | After part 1 |
| Design review items 9–10: /me sections, plus "הבא" above the dial | tau-designer | `src/app/[locale]/me/page.tsx`, /me components (visual), `src/components/events/season-dial.tsx`, `season-timeline.tsx` | agent/design | Started 19.11 |
| Design review, round 2 (reads only): English pages, login, admin, 360px | tau-designer | `design/review/round-2/**` | agent/design | After 9–10 |
| Add to home screen, part 2: final icon sizes, iPhone launch images, the card's look (after part 1 is merged) | tau-designer | `public/` icons and launch images, `design/home-screen/**`, the card's visual markup, `messages/*.json` card wording | agent/design | Waiting for part 1 |
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
