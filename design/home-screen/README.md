# Add to home screen: options to choose from (19.11)

Mockups only, no app code. Approved in `docs/DECISIONS.md` (19.11). The user picks one option. Parts can also be mixed, for example the icon from one option with the hint from another.

| File | What it shows |
|---|---|
| `option-1.png` | **Quiet.** Today's icon (the full logo on the logo's purple). The opening screen is that purple with the logo. In /me, one small line under the details card: "אפשר לפתוח את המועדון ישר ממסך הבית. איך?" |
| `option-2.png` | **A card in /me.** A new icon: the big TAU mark on the logo's purple and grid, without "AI CLUB", so it stays readable when small. The opening screen is the logo with COHORT 02 · 2026–27. In /me, a purple card under the details: "המועדון במסך הבית", with "לא עכשיו". |
| `option-3.png` | **A sheet after sign-in.** The TAU mark on the site's dark background, with a purple glow. The opening screen looks like the top of the home page. A sheet slides up once, right after the first sign-in on a phone. After "אולי אחר כך", option 1's small line stays. |
| `icons.png` | The three icons side by side: on iPhone, in Android's circle, at real size, in a folder and on a light background. |

Each option board has two rows, iPhone (Safari) and Android (Chrome), with four steps each: the hint in the browser → the icon on the home screen → the opening screen → the site opening on /me in its own window, with no address bar.

## What's true for all options
- The name under the icon is **TAU AI Club** (11 characters, so it isn't cut off). Changing it is the user's call.
- The site opens on `/me`. A member who isn't signed in goes to `/login` first, then to `/me`.
- The hint shows only on a phone, only in the browser (never when the site is already opened from the icon), and only until the member adds it or taps "not now".
- **iPhone:** a site can't add itself, so the hint explains two steps: Share → "הוספה למסך הבית". Check the exact wording on a Hebrew iPhone before building. The opening screen is ours to design (launch images).
- **Android:** the button opens Chrome's own install window. Chrome builds the opening screen itself from the background colour, the icon and the name, so it can't be designed beyond that.
- Colours come from the frozen tokens, and the logo is never mirrored. Icons 2 and 3 use the logo without its "AI CLUB" line. That crop is a brand decision for the user.

## Sources (to remake the pictures)
- `icons.html` makes `assets/icon-2.png` and `assets/icon-3.png` at 1024px. `assets/icon-1.png` is today's `src/app/icon.png`.
- `assets/mark.png` and `assets/lockup.png` are cut from `public/brand/logo-mark.png`.
- `assets/me-*.png` are real screenshots of /me from a local server. The data is the seed fixtures and a made-up member, "נועה לוי". The hint was injected from `hints/*.html`.
- `board.html?opt=1|2|3` and `board.html?view=icons` draw the boards. They were saved at 1.5×.
