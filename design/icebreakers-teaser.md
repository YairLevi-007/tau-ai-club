# Icebreakers teaser: notes

Comp: `design/icebreakers-teaser.html` (`?lang=he` or `?lang=en`). Source: open initiative #03 in `brand/יוזמות-פתוחות-מחזור-ב.pdf.txt`, an app that pairs members for a short 1:1 chat before each meetup.
Audience: club members (the cohort). The card sits on the public home page and is only a coming-soon card.
Status: a teaser only. Nothing about the pairing flow is built yet (no RSVP, no sign-up, no link).

## Copy (UI microcopy, so it goes in `messages/*.json` under `home`)

| Key | he | en |
|---|---|---|
| `icebreakersSoon` | בקרוב | Coming soon |
| `icebreakersTitle` | משחקי היכרות לחברי המועדון | Icebreaker games for club members |
| `icebreakersBody` | לפני כל מפגש נשדך אתכם לשיחת 1:1 קצרה עם מישהו מהמחזור. ככה עד סוף השנה, כולם מכירים את כולם. | Before each meetup we'll pair you up for a quick 1:1 chat with someone from the cohort. By the end of the year, everyone knows everyone. |

"1:1" goes in `<bdi dir="ltr">` in Plex Mono (it reads "1:1" in both languages).

## Design

- **Where:** home page, directly below the founders section ("תכירו את מקימי המועדון"). Same container and section spacing as the speakers strip (pt 80, 112 from lg).
- **Card:** `bg-bg-deep`, 1.5px **dashed** `border-border-strong`, `rounded-lg`. The dashed border says "not here yet" next to the solid cards around it.
- **Chip:** the flyer chip (`FlyerChip`). "Coming soon" in Silkscreen caps in English, "בקרוב" in Rubik 500 in Hebrew.
- **Heading:** h2 with balanced wrapping (`text-balance`), Rubik 800 (he) or 700 (en), clamp(1.625rem, 4vw, 2.25rem). Body `text-fg-muted`, max 52ch.
- **Motif:** two empty "seats" (dashed purple-soft rings with a pixel "?") joined by four pixel squares, for pairing two people. `aria-hidden`. At the inline end on md+ and below the text on mobile.
- **State in text, not only colour:** the chip text says "coming soon".
- **No button, no link, no motion.** It's a server component, fully visible without JS, and not in `[data-reveal]`.
- **Tokens:** existing ones only (`brand-purple`, `brand-purple-soft`, `brand-purple-softer`, `brand-purple-deeper`, `logo-block`, `bg-deep`, `bg-raised`, `border-strong`, `fg`, `fg-muted`). No new colours.
