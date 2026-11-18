# Instagram pass: notes

Comp: `design/instagram-pass.html` (open it with `?lang=he` or `?lang=en`). Sources: the five posts in `brand/instagram/`.
Tokens v1.1 are unchanged: every colour in the comp is an existing token. Nothing new needs the user's OK.

## What comes over from the posts

| Post element | On the site | Where |
|---|---|---|
| Eyebrow chip `■ COHORT B / CLAUDE CODE 1/3` | `.chip`: 1.5px purple border, 3px radius, 8px purple square. Latin in Silkscreen caps, Hebrew in Rubik 500 (Silkscreen has no Hebrew). Latin series names inside Hebrew go in `<bdi dir="ltr">`. | Event page above the title, Next-event card ("Next meetup") |
| Title with a purple part ("past" / "future", "part 1 of 3") | Rule: the text **after the first colon** is purple (`--brand-purple`, large display text only). With no colon, the whole title stays white. No markup in the data. | Event page h1, Next-event card title |
| Circular photo with a purple ring | `.avatar`: 3px `--brand-purple` ring, 4px dark gap, photo or initials. Built sizes (photo sources are 96px, so never larger): 96 solo / 80 several on the event page, 88 strip, 72/52 dial pop-up, 48 Next-event card. Company badge only from 56px. | Event page, Next-event card, speakers strip |
| Company logo badge | **Company initial** in a dark rounded square (no logo files, no hot-linking). Decorative (`aria-hidden`); the company is written out next to it. Hidden when there is no company. | Same |
| Name / company / ROLE in caps | Name Rubik 700. Company `--fg-muted`. Role in `--brand-purple-soft`: Plex Mono 600 caps with tracking in English, Rubik 500 in Hebrew. | Speakers strip cards |
| DATE / TIME / WHERE boxes | `.tile`: pixel label (Hebrew: Rubik 500), big value, small sub-line. Desktop columns 1.1 / .8 / 1.5. Mobile: date + time side by side, where full width. Times and dates in Plex Mono inside `<bdi dir="ltr">`. | Event page (replaces the date aside), Next-event card (compact, no sub-lines) |
| Pixel-square cluster | Inline SVG staircase in the top inline-end corner: `--brand-purple` steps, a few `--logo-block` / `--logo-grid` strays. Mirrors in RTL. `aria-hidden`, no motion. | Event page hero |
| Corner brackets | 26px L-shapes in `--border-accent`, 16px inset. | Event page hero, speakers strip |
| `MEET OUR SPEAKERS` | `.pix-head`: Silkscreen caps, line 2 purple. Hebrew: Rubik 800, line 2 purple and a purple square (no pixel font in Hebrew). | Home speakers strip heading; usable for other section titles |
| `■ REGISTER ON LUMA` | Pixel link with a purple square, used as a secondary text CTA. The main CTA stays a button. | Next-event card |

## Rules kept
- The Next-event card stays a server component, visible at first paint, with no entrance animation.
- The logo is never mirrored; the cluster and the arrows are.
- Speaker contact data stays out of all of this: only name, role, company, photo and the public LinkedIn link that the builder already exposes.
- Contrast: the purple title accent is only used at ≥24px bold (3:1 large-text rule holds: #8A2BFF on #0B0A1F is about 3.6:1). Purple text at body size uses `--brand-purple-soft`.

## Audit items in the same pass
- **S5**: "Back to the season" gets `min-height: 24px` and 4px block padding.
- **N4**: header logo `sizes="(min-width: 768px) 78px, 65px"`.
- **N5**: dial month labels between 90° and 270° get an extra 180° turn, so they read upright.
- **N9**: `[data-reveal]` is shown under `@media print`, on `beforeprint`, and when `navigator.webdriver` is true, with no animation. Visitors keep the scroll reveal.

## Not done / open
- The real speaker photos in `brand/instagram/` are not copied anywhere. The comp uses drawn sample faces. Photos come from Supabase (`speakers.photo_url`) via the builder's work.
- `brand/instagram/*.jpg` is left uncommitted: the repo is public and the posts contain people's photos. Committing them is the user's call.
- Implementation in `src/` waits for the builder's speaker-photo commit.
