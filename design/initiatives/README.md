# "יוזמות" (Initiatives) tab: options to choose from (19.11)

Mockups only, no app code. The user picks one option, or mixes parts (for example option 2 with option 3's stages).

**Decided (DECISIONS 19.11), the same in every option:** any member proposes an initiative from the tab; an admin approves it before it shows (an admin's own goes up at once); every member signs up on the site. **Still open:** who sees the tab, and what an initiative holds.

| File | What it shows |
|---|---|
| `overview.png` | The three options side by side, a comparison table, and my recommendation (option 1). |
| `option-1.png` | **פשוט, לחברים.** Members only. A short card (what, when, where, spots), "אני בפנים", faces of who's in. The lead sees who's in and sends an update through the site (member emails stay hidden). |
| `option-2.png` | **עם תפקידים, לחברים.** Members only. Stages (recruiting, in progress, done) and roles with counts; members pick a role. Done ones keep a result link. |
| `option-3.png` | **פתוח לכולם.** Guests see the tab too, with counts but no member names; "כניסה לחברים כדי להצטרף". Done ones stay as a showcase. |
| `kinds.png` | **Chosen: option 1 with two kinds** (DECISIONS 19.11). A club initiative (purple frame and glow, a "יוזמת המועדון" badge with the logo, under "המועדון מבקש") vs a member's initiative (the plain card, a grey "יוזמה של חבר" tag, under "יוזמות של חברים"). Filters: הכל / של המועדון / של חברים / שלי. An admin makes it the club's on approval (a "זו יוזמה של המועדון" switch) or later from "פורסמו" (with an optional "why", shown on the page), and can undo it. The proposer stays the lead and gets an email. |
| `approval.png` | Same in all options: a member sends a proposal ("שליחה לאישור"), sees it as "ממתינה לאישור" (or returned with a note) under "שלי", and an admin approves, returns with a note, or rejects in a new admin tab "יוזמות". |

Each option board shows the list, one initiative and proposing one, on desktop and phone (390), in Hebrew.

## How it was made
- `src/screens.mjs` (the content), `src/mock.css` (token variables only, no new colours).
- `src/shoot.mjs` injects them into real pages of a local dev server (fixtures, a mock admin member, port 3670), so the header, backdrop, fonts and buttons are the site's own. Output: `screens/*.png`.
- `board.html?opt=1|2|3` / `?view=all` lays out the boards; `src/boards.mjs` renders them.
- All names and initiatives are made up.

## Not decided here (for the builder later)
- Bilingual fields (`title_he` / `title_en`) like all content; English falls back to Hebrew.
- Who joined is member data: RLS and the security check apply. The lead sees names only and writes to everyone through the site, never their emails.
- A `kind` on each initiative (club / member), plus who adopted it, when, and an optional reason.
- Approval needs a status on each initiative (pending, returned with a note, published, rejected) and emails to the member at each step.
