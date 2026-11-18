# Committee guide: running the AI Club site

The short English version of `ADMIN-GUIDE.he.md`, which is the full guide. Everything happens on the site itself, at **tauaiclub.com**. Labels in **bold** match the buttons in the English UI (`/en`).

> The repo and site are public. Never upload files with people's personal details anywhere except where this guide says to, such as the Luma guest export.

## 1. Sign in
1. Click **Members** at the top, then **Sign in with Google**, and pick the Google account whose email is on the members list.
2. Your first sign-in shows "Hi [name], welcome to the AI Club".
3. Admins: click **Members** again, then **Admin**.
4. If you see "Members only", that email isn't on the list. **Sign out** and use the right account, or ask an admin to add it.

## 2. Members (**Admin → Members**)
- **Add a member:** enter the exact Google email, full name and role, then **Add**.
- **CSV import:** columns `email, full_name, role` (`member` or `admin`; empty means `member`). A known email is updated and a new one is added. One bad row stops the whole import, and the message names the row.
- **Secondary email:** on the member's card, **Add a secondary email**. They can sign in with any of their emails.
- **Role:** pick **Member** or **Admin**, then **Save**. There must always be at least one admin.
- **Remove:** **Remove**, then confirm. Access ends immediately and their profile is deleted.

## 3. Meetups (**Admin → Events**)
New meetups are **Draft**s, so guests can't see them or their speakers. Switch the status to **Published** and save to show one.
- **Manually:** **New event**, fill in the form (times are always Israel time), then **Create event**.
- **From Luma** (most accurate): **Fill in from Luma or a flyer** → paste the Luma link → **Import from Luma** → check the marked fields → **Fill the form** → save.
- **From a flyer:** same panel → pick the image (PNG/JPEG/WebP, up to 10MB) → **Read flyer**. It's read in your browser and is good at dates, times and links but weak at titles, which come through as suggestions only. Check everything, **Fill the form**, save.
- **Speaker cards from a flyer:** the flyer reader finds faces. For each speaker choose an existing speaker, create a new one, or skip, and adjust the crop. You can also do it from **Admin → Speakers** → edit → **From a flyer** → **Use this person**.
- **Delete event** is permanent. To hide a meetup, set it back to **Draft**.

## 4. Speaker contact details
1. **Admin → Events → Edit** the meetup → the **Speaker contact details** section → **Create link** next to the speaker. The link lasts 14 days by default.
2. Copy it right away, because it's shown only once, and send it to the speaker. It works once; a new link cancels the old one.
3. The speaker ticks each field separately, and anything left unticked isn't stored. Email and phone are visible only to signed-in members. LinkedIn is public only if the speaker opted in.
4. The admin area shows only *which* fields were shared, not the values.
5. If a speaker asks for deletion: **Delete details** → confirm. The data is gone for good.

## 5. Attendance after each meetup
1. At the door, check guests in with the Luma app.
2. Afterwards, on luma.com: the event → **Guests** → **Export CSV**.
3. On the site: **Admin → Events → Edit** the meetup → **Attendance from Luma** → pick the file → check the preview → **Save attendance**. Uploading again replaces it.
4. The season grid and its export are under **Admin → Attendance**.
5. Delete the export from your computer afterwards. It holds every guest's name, email and phone, while the site stores only members' attendance and a guest count.

## 6. Lecture summaries (**coming soon**)
Still being built. A member writes the summary, and an admin pastes it (Hebrew and English) or attaches a PDF on the meetup's page, choosing what's public and what's members-only, then publishes.

## 7. Who sees what
| | Guests | Signed-in members | Admins |
|---|---|---|---|
| Home, next meetup, season | ✓ | ✓ | ✓ |
| Meetup pages | published only | published only | including drafts |
| Speaker LinkedIn | only if the speaker opted in to public | if shared | if shared |
| Speaker email / phone | never | if shared | if shared |
| Member profiles | ✗ | ✓ | ✓ |
| My profile and attendance | ✗ | own only | ✓ |
| Admin area | ✗ | ✗ | ✓ |

Someone signed in with an email that isn't on the list sees "Members only", exactly like a guest. There are no join requests: only admins add members.
