# "יוזמות" (Initiatives) tab: options to choose from (19.11)

Mockups only, no app code. The user picks one option, or mixes parts (for example option 2 with option 3's stages).

| File | What it shows |
|---|---|
| `overview.png` | The three options side by side, a comparison table (who sees it, what an initiative holds, "I'm in", how heads post, build size), and my recommendation. |
| `option-1.png` | **לוח מודעות.** Members only. A short post and one link out (WhatsApp, form, Luma). The site doesn't know who joined. Heads post in admin. |
| `option-2.png` | **"אני בפנים".** Members only. Join with one tap on the site: faces, spots left, cancel. The lead sees who's in and copies their emails. Heads post from the tab itself (dialog / bottom sheet). |
| `option-3.png` | **מה בונים במועדון.** Guests see it too (no member names). Stages (recruiting, in progress, done), roles with a count, members pick a role, done ones keep a result link. Heads post in admin. |

Each option board shows the list, one initiative and posting, on desktop and phone (390), in Hebrew.

## How it was made
- `src/screens.mjs` (the content), `src/mock.css` (token variables only, no new colours).
- `src/shoot.mjs` injects them into real pages of a local dev server (fixtures, a mock admin member, port 3670), so the header, backdrop, fonts and buttons are the site's own. Output: `screens/*.png`.
- `board.html?opt=1|2|3` / `?view=all` lays out the boards; `src/boards.mjs` renders them.
- All names and initiatives are made up.

## Not decided here (for the builder later)
- Bilingual fields (`title_he` / `title_en`) like all content; English falls back to Hebrew.
- Who counts as a "club head" who can post: today's `admin` role, or a new role.
- Option 2 and 3 store who joined: that's member data, so RLS and the security check apply.
