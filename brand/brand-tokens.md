# TAU AI Club: Brand Tokens (v1.1, approved)

Status: **APPROVED by the user on 2026-11-13.** These tokens are frozen. Changing one needs the user's OK.

## Sources (where every value comes from)

| Source | What it gave us |
|---|---|
| `brand/logo-screenshot.png` | Logo colors, read pixel by pixel with Python/PIL: accent purple, white, the indigo logo background and grid lines |
| `brand/AI_past_and_future_Shai_Yahal.pdf` | Exact fill colors from the PDF content streams (`rg` operators), embedded fonts, cover layout and long-form page layout |
| `brand/יוזמות-פתוחות-מחזור-ב.pdf` | Same, plus the card / status-pill / numbered-list pattern on a dark page |
| instagram.com/tau.ai.club | Blocked by a login wall, so it isn't used yet. I could see past it that the avatar is the logo on near-black and that posts use the same pixel eyebrow + big Rubik headline as the PDFs. Copy tone below stays **provisional** until we have post screenshots. |

Every hex below is sampled or extracted. **Derived** marks a value I computed from a sampled one, such as a translucent version. Nothing is guessed.

---

## 1. Color

### Brand core
| Token | Hex | Source | Use |
|---|---|---|---|
| `--brand-purple` | `#8A2BFF` | PDFs (most-used accent, 51×). Logo pixels average `#8C2AFD`, the same color after JPEG-ish noise | CTA fills, filled pills, focus rings, active states, the "A"/"AI" in the logo. **Never body text** (only 3.6:1 on base) |
| `--brand-purple-deep` | `#6A1FD0` | PDF | Hover/pressed for CTA fills, gradient end |
| `--brand-purple-deeper` | `#5C1CAB` | PDF | Gradient stops, pressed state, glow core |
| `--brand-purple-soft` | `#A970FF` | PDFs (eyebrows, numbers "01/02", "& future") | Accent **text**: links, numbers, eyebrows, highlighted words (6.0:1 on base ✅ AA) |
| `--brand-purple-softer` | `#B990FF` | PDF | Accent text on lighter surfaces, hover for links (7.9:1) |
| `--brand-lilac` | `#DDD0FF` | PDF | Tinted highlights, selection bg on light, chip text |
| `--logo-indigo` | `#241163` | Logo bg average (radial: `#28136C` center → `#1F0F57` edges) | Logo lockup tile, hero glow tint. Not a page background |
| `--logo-grid` | `#291666` | Logo 1px grid lines (every ~60px) | Background grid pattern, decorative only |

### Surfaces (dark, near-black, never `#000`)
| Token | Hex | Source | Use |
|---|---|---|---|
| `--bg` | `#0B0A1F` | PDF cover base | Page background |
| `--bg-deep` | `#070A1C` | Initiatives PDF | Footer, behind-the-page areas |
| `--bg-raised` | `#120B3A` | PDF | Hero band, section bands, popovers |
| `--surface` | `rgba(246,244,255,0.04)` | Derived (`--fg` @ 4%), matches the translucent cards in the initiatives sheet | Cards |
| `--surface-hover` | `rgba(246,244,255,0.07)` | Derived | Card hover |
| `--border` | `#2A2540` | PDFs (50×, rules and card strokes) | Hairlines, card borders, dividers |
| `--border-accent` | `rgba(138,43,255,0.45)` | Derived from `--brand-purple` | Outlined pill ("taken by…"), focused card |

### Text
| Token | Hex | Contrast on `--bg` | Use |
|---|---|---|---|
| `--fg` | `#F6F4FF` | 17.9:1 | Headings, primary text (off-white with a violet tint, from PDF) |
| `--fg-muted` | `#CFC8F0` | 12.2:1 | Long-form body text, descriptions |
| `--fg-subtle` | `#9C93C9` | 6.9:1 | Meta, captions, timestamps |
| `--fg-faint` | `#5B5575` | 2.8:1 ⚠️ | Decorative only, disabled. **Never for readable text** |
| `--on-purple` | `#FFFFFF` | 5.4:1 on `--brand-purple` | Text on purple buttons/pills |
| `--destructive` | `#FF6B8A` | 6.9:1 | Delete buttons, error messages, invalid fields. Not in the PDFs: added and approved by the user 2026-11-16 (v1.1) |

### Light context (only for printable/long-form pages, as in the PDF inner pages)
`--paper` `#FFFFFF` · `--ink` `#2A2540` · `--ink-muted` `#5B5575` · accent rules `#8A2BFF`. The site itself is dark-first. This only exists for a possible print stylesheet.

### Signature effects
- **Grid:** 1px `--logo-grid` lines on a ~56–64px square grid, faded with a radial mask. This echoes the logo and the PDF cover.
- **Glow:** `radial-gradient(60% 50% at 50% 0%, rgba(138,43,255,0.22), transparent 70%)` over `--bg`, with a second faint `--brand-purple-deeper` bloom. One glow per viewport, max.
- **Pixel blocks:** solid squares in `--logo-indigo` / `#36167E` (sampled from the block left of the logo) as sparse accents, as on the PDF cover.
- **Corner brackets:** 2px purple L-shaped corner marks framing hero/cover areas (from both PDF covers).

---

## 2. Typography

The club already has a type system. Both PDFs embed the same three families, and all are free on Google Fonts:

| Role | Font | Evidence | Notes |
|---|---|---|---|
| Display + body (HE + EN) | **Rubik** (300–800) | Embedded in both PDFs (`Rubik-Light`, `RubikLight-Bold/ExtraBold`) | Has full Hebrew support, and its rounded geometric shapes sit well beside the blocky pixel logo. **This is the Hebrew pairing.** Headings 700–800, body 400 (300 is too thin for body text on a dark background) |
| Pixel labels | **Silkscreen** (400) | Embedded in both PDFs (eyebrows, "@TAU.AI.CLUB", "LET'S BUILD") | Latin only. Use it for short uppercase eyebrows, tags, "COHORT 02", numbers. Letter-spacing 0.2–0.3em. Keep it on Hebrew pages too, as the PDFs do, but **never set Hebrew in it** |
| Mono / data | **IBM Plex Mono** (400, 600) | Embedded in both PDFs (section numbers, URLs) | Dates, times, counters, "01/02/03", code, URLs |

Hebrew pixel option: no good open Hebrew pixel font exists. Hebrew eyebrows go in Rubik 500 with a small size and **no** letter-spacing (spacing breaks Hebrew), and a Silkscreen Latin tag can sit beside them.

### Scale (fluid, mobile-first)
| Token | Size | Weight / LH |
|---|---|---|
| `display` | `clamp(2.75rem, 7vw, 5rem)` | Rubik 800 / 1.0, tracking −0.02em (EN only) |
| `h1` | `clamp(2rem, 5vw, 3.25rem)` | 700 / 1.1 |
| `h2` | `clamp(1.5rem, 3.5vw, 2.25rem)` | 700 / 1.15 |
| `h3` | `1.25rem` | 600 / 1.3 |
| `body-lg` | `1.125rem` | 400 / 1.7 |
| `body` | `1rem` | 400 / 1.7 (Hebrew needs the extra leading) |
| `small` | `0.875rem` | 400 / 1.5 |
| `eyebrow` | `0.75rem` | Silkscreen, uppercase, 0.25em tracking, `--brand-purple-soft` |

Long-form: `max-width: 68ch`, `--fg-muted` body, `--fg` headings.

**RTL rule for numbers/dates/codes:** wrap mono runs (dates, times, "01 · 02", URLs, hex) in `<bdi>` or `dir="ltr"` + `unicode-bidi: isolate`. Without it, sequences like `01 · 02 · 03 — 18.11.2026` reorder in Hebrew context (seen in the preview).

The PDF pattern for two-tone headlines is to put the first line in `--fg` and the second in `--brand-purple-soft` ("AI: past / **& future**"). Use it once per page, in the hero.

---

## 3. Shape, space, elevation, motion

- **Radius:** `--r-sm 6px` (pills, inputs) · `--r-md 10px` (buttons) · `--r-lg 14px` (cards, matching the initiatives sheet) · `--r-full` (status pills). The logo's pixel squareness stays in the logo and blocks, and UI corners are softly rounded, as in the PDFs.
- **Space:** 4px base: 4, 8, 12, 16, 24, 32, 48, 64, 96, 128. Mobile gutter 16px, desktop container 1120px.
- **Elevation:** shadows don't show on near-black, so depth comes from (1) translucent surface + 1px border, (2) a top inner highlight `inset 0 1px 0 rgba(246,244,255,0.06)`, (3) purple glow `0 0 0 1px rgba(138,43,255,.35), 0 8px 32px -8px rgba(138,43,255,.35)` reserved for the featured card (Next event) and primary CTA hover.
- **Focus:** `2px solid #8A2BFF` + `2px` offset on `--bg`.
- **Motion:** ease `cubic-bezier(0.22, 1, 0.36, 1)` (ease-out-quint). Durations 150ms (hover/press), 250ms (UI), 500–700ms (section reveals). Reveals: opacity 0→1 + translateY 8–12px, stagger 60ms. No bounce, no spring overshoot, no scale-in on text. `prefers-reduced-motion` turns off transforms and keeps opacity fades only. The Next-event card renders immediately and never waits for an intro.

---

## 4. Logo usage

- **Primary:** full-color lockup (white "T_U" + purple "A", "AI" purple, "CLUB" white) on `--bg`, `--bg-raised` or `--logo-indigo`. It is designed for dark backgrounds.
- **Clear space:** at least the height of one pixel-block row of "TAU" (≈ 1/5 of the TAU cap height) on all sides. Nothing inside it.
- **Min size:** 88px wide (web), 24px for the "TAU" mark alone (favicon/avatar).
- **Don't:** recolor the purple, put it on white or a light photo without a dark tile, stretch it, add shadows/outlines, set "TAU AI CLUB" in another font in place of the logo, animate the letters apart.
- **Pixel art stays crisp:** serve as SVG (or PNG at 2×/3× with `image-rendering: pixelated`). Never blur or smooth it. We need a clean vector or high-res original, because the screenshot is too small (367×226) for production.
- **Placement:** Hebrew (RTL) puts the logo at the start, on the right, as in the initiatives sheet. English mirrors the layout, but the logo itself is never mirrored.

---

## 5. Visual tone

Dark, precise and a little playful: an AI lab poster crossed with an 8-bit start screen. That means near-black indigo surfaces, a faint grid, one purple glow, crisp pixel accents and big confident Rubik headlines. It should feel premium and calm, with purple used sparingly for emphasis. The pixel motif shows up only as small accents (eyebrows, blocks, brackets, the logo) and is never used as a gimmick font for content.

## 6. Copy tone of voice (provisional, pending Instagram screenshots)

From the club's own sheets:
- **Hebrew-first, plural "you"** (אתם / כתבו / הציעו), friendly and direct: "בוחרים יוזמה, לוקחים בעלות, ובונים."
- **Short, verb-led sentences.** Builder energy: build, take, pick.
- **English is for tech terms and the club's labels** (LET'S BUILD, COHORT 02, Kickoff Session). Don't translate "AI", "Agents", "LLM".
- **Casual and warm.** "יש לכם רעיון אחר? מתקבל בברכה." No corporate phrasing, no hype, no emoji walls (one is fine on social, rare on the site).
- **English version:** same voice, lowercase-friendly, short. "Pick an initiative. Own it. Build."
- **Sign-offs / taglines:** `LET'S BUILD`, `@TAU.AI.CLUB` (in Silkscreen).

---

## 7. What I take from each reference

**raycast.com: dark premium surfaces, glow and depth.**
- Near-black backgrounds that are tinted, not pure black. For us that's an indigo tint taken from the club's `#0B0A1F`.
- Depth from layers: translucent card + hairline border + 1px top highlight. No drop shadows.
- One colored glow per viewport that guides the eye to the hero or key card. Ours is purple, aimed at the Next-event card.
- Crisp, dense UI details (kbd-like chips, mono meta) beside big confident headlines.
- *Not taking:* multicolor gradients, heavy 3D renders, product-chrome mockups.

**anthropic.com: calm editorial motion and reading.**
- Motion supports reading: small fades and short slides, slow ease-out, nothing bouncy or attention-seeking.
- Generous whitespace, measured line length and real typographic hierarchy on long pages (lecture summaries, about).
- Restraint: content leads, and decoration steps back as you scroll down from the hero.
- *Not taking:* the warm ivory/serif palette. We stay dark and sans, true to the club's brand.
