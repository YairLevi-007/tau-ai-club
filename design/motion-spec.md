# Motion spec: home page, Milestone 1

Library: **motion.dev** (`motion/react`). Reference: anthropic.com (calm, editorial), plus Emil Kowalski's rules:
- ease-out for anything entering;
- short durations;
- animate only `transform`, `opacity` and `filter`;
- never from `scale(0)`;
- nothing animates on every interaction a user repeats often;
- animations must be interruptible.

## 0. The one hard rule
**The Next event card is server-rendered and fully visible at first paint.** It has no `initial` and no entrance animation, and it is never wrapped in a component that starts at `opacity: 0`. This rule:
- doesn't depend on JS, hydration or fonts;
- holds with JS disabled (QA should check this);
- puts the card above the fold on a 390×844 phone (verified in the comp).

The intro plays *around* the card, never on it.

## 1. Tokens
```ts
export const ease = {
  out: [0.22, 1, 0.36, 1],      // ease-out-quint: entrances, reveals
  inOut: [0.65, 0, 0.35, 1],    // things moving on screen (rare)
} as const;
export const dur = {
  press: 0.1,    // :active scale
  hover: 0.15,   // color/bg
  ui: 0.25,      // tags, popovers, lang switch
  intro: 0.6,    // hero lines
  reveal: 0.55,  // scroll reveals
} as const;
export const distance = { intro: 10, reveal: 12 } as const; // px, Y only
```
CSS mirror: `--ease-out: cubic-bezier(.22,1,.36,1)`.

## 2. First-load intro (home only, once per session)
One authored moment: the hero lines arrive in order while the card is already there.

| Order | Element | From → To | Delay | Duration |
|---|---|---|---|---|
| 0 | Header (logo + actions) | opacity 0→1 | 0ms | 600ms |
| 1 | H1 line 1 | opacity 0→1, y 10→0 | 130ms | 600ms |
| 2 | H1 line 2 (purple) | opacity 0→1, y 10→0 | 200ms | 600ms |
| 3 | Pitch | opacity 0→1, y 10→0 | 270ms | 600ms |
| 4 | Cohort meta line | opacity 0→1, y 10→0 | 340ms | 600ms |
| — | **Next event card** | **none, visible from frame 1** | — | — |
| — | Hero grid + glow | static (CSS background) | — | — |

- Stagger is 70ms, the whole intro takes ≈ 940ms, and the user can scroll at any time.
- Use `whileInView` off and `animate` on mount, inside a client component that wraps only the hero text.
- Skip the intro after the first view in a session: set `sessionStorage['intro-seen']`, and on later visits render final state with no `initial`. Wrap storage access in try/catch.
- **No-JS / pre-hydration safety:** the hero text is in the SSR HTML at full opacity. Apply `initial` only on the client, via a `data-intro` attribute set by an inline script before paint, or by using motion's `initial={false}` when the flag is set. That way the text never flashes invisible if hydration is slow. Alternatively, do it in CSS as the comp does: `@keyframes` with `animation-fill-mode: both`, gated by `prefers-reduced-motion: no-preference`.

## 3. Scroll reveals (season timeline)
- Elements:
  - the season heading;
  - the sub line;
  - the legend;
  - each month label;
  - each event row.
- Animation: opacity 0→1, y 12→0, 550ms, ease-out.
- Trigger: `whileInView`, `viewport={{ once: true, margin: "0px 0px -10% 0px" }}`.
- Stagger: within one viewport batch, rows get `delay = (index % 3) * 50ms`. That way rows entering together cascade lightly, and long scrolls never build up delay.
- Rows already in the viewport at load (desktop) reveal right after the intro, at the same timing. Nothing waits more than ~400ms.
- The next row's node and highlight are static. No pulsing, no looping animation anywhere on the page.

## 4. Interaction
| Element | Motion |
|---|---|
| Buttons | bg/border color 150ms ease-out. `:active` scale .98 over 100ms. Primary hover adds an offset shadow `0 8px 20px -8px` purple, over 200ms |
| Timeline row (link) | title color 150ms. No movement, because rows are scanned often |
| Lang switch | Instant locale change (route change). No cross-fade of the whole page. The new page gets **no** intro (session flag already set) |
| Focus ring | instant, no transition |
| Tags | static |

## 5. Reduced motion
With `prefers-reduced-motion: reduce`:
- the intro is off, and everything renders in its final state;
- scroll reveals are off, so content is visible at once (no opacity fade either, to keep it simple and fast);
- the button press scale is off. Color transitions stay, because they're not motion.

In motion.dev, use `<MotionConfig reducedMotion="user">` at the root, plus an explicit `useReducedMotion()` check that skips `initial` entirely, so nothing even mounts hidden.

## 6. Don'ts
- No bounce or spring overshoot on content (`type: "spring"` only with `bounce: 0` if ever needed).
- No scaling text in, no blur-in on headlines, no parallax on the grid, no cursor followers.
- No animation on the Next event card, ever, including when the "next" changes at 20:00. On revalidation it just renders the new event.
- Don't animate layout properties (height, top, width). Use transform.
- Total motion on the home page must not delay first interaction. LCP element = H1 or the card title, and both are in SSR HTML.

## 7. QA checklist
- [ ] Card visible in the very first screenshot frame (Playwright with `animations: 'allow'`, screenshot at 0ms after load).
- [ ] With JS disabled, all hero text and the timeline are visible.
- [ ] Reduced motion: no element ever has computed `opacity < 1` after load.
- [ ] Intro plays once per session, and not after a language switch.
- [ ] Both directions: Y-only motion, so nothing needs mirroring.
