# HANDOVER (v1.4, 2026-11-18)

How the TAU AI Club site runs, what it depends on, and how to hand it to the next club team.
Keep this file current: whoever adds a service or env var updates it in the same PR.

## 1. Services

| Service | What for | Account / owner (target) | Plan | Status |
|---|---|---|---|---|
| GitHub | Code, PRs, Vercel's git source | Org `tau-ai-club`, repo `tau-ai-club/site` (**public**: Vercel Hobby can't deploy private org repos) | Free | ⏳ to create |
| Vercel | Hosting, preview deploys | Hobby account of a club admin, project `tau-ai-club`. Production: **`https://tauaiclub.com`** (`www` → apex), fallback `tau-ai-club.vercel.app` | Hobby (non-commercial only: no ads, no paid work on the site) | ⏳ to create |
| Supabase | Postgres, RLS, Auth (M2) | Dedicated org "TAU AI Club", projects `tau-ai-club-dev` and `tau-ai-club-prod` | Free (projects pause after ~7 days without traffic; dev may pause, prod gets daily traffic) | ⏳ to create |
| Google Cloud | OAuth client for "Sign in with Google" (M2) | Project `tau-ai-club`, owned by the club Google account | Free | ⏳ to create (runbook F1) |
| Luma | Event registration (we only link to it) | Club's Luma calendar | Free | exists |
| Domain `tauaiclub.com` | Production domain (apex), `www` redirects to it | Registrar: **GoDaddy** (from public RDAP/DNS: nameservers `ns21/ns22.domaincontrol.com`; confirm). Account owner: **TBD** (should be the club account). Renewal: **TBD** (RDAP shows registered 2026-11-10, expires 2027-11-10; turn on auto-renew) | Paid yearly | bought by the club; DNS ⏳ to point at Vercel (runbook B2) |

Every service should be owned by a **club account** (e.g. a shared `tau.ai.club@…` Google account), with at least two current board members as admins. Personal accounts are only a bootstrap.

## 2. Environment variables

| Name | Where | Value | Secret? |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel (Production → prod project; Preview + Development → dev project), `.env.local` | `https://<ref>.supabase.co` | No |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | same | `sb_publishable_…` (Supabase → Project Settings → API Keys) | No (RLS protects data) |
| `NEXT_PUBLIC_SITE_URL` | Vercel **Production only**; `.env.local` | Production: **`https://tauaiclub.com`** (no trailing slash). Local: `http://localhost:3000`. Leave unset on Preview. It drives metadataBase, canonical/hreflang, OG URLs, `sitemap.xml`, `robots.txt` and calendar links | No |
| `ENABLE_EXPERIMENTAL_COREPACK` | Vercel, all environments | `1` (use the exact pnpm from `packageManager`) | No |
| `DATA_SOURCE` | **TEMPORARY until Supabase; remove after migration.** Vercel Production (and Preview) only during the seed launch | `seed` = serve the season from the committed seed (`src/lib/data/fixtures.json`, generated from `supabase/seed.sql`), production included. Unset = Supabase. Without Supabase vars and without this flag the site keeps showing "couldn't load the events" (it never falls back silently) | No |
| `AUTH_ENABLED` | Vercel (Production and Preview), `.env.local` | `true` switches the members/admin area on. Set it **only after runbook G** (email codes, SMTP and the auth hook configured in Supabase), then redeploy. Unset, any other value, missing Supabase vars or `DATA_SOURCE=seed` = off: sign-in links are hidden, `/login`, `/welcome`, `/me`, `/profile`, `/members/…`, `/members-only`, `/admin/…` and `/speaker/…` show a calm "בקרוב / Coming soon" page (200, noindex, same URL), and no cookie-aware Supabase client is created. While on, `/lectures` and `/workshops` are members only and hidden from the guest header | No |
| `USE_FIXTURES` | local / QA only | `1` = use seed fixtures without Supabase. Ignored in production | No |
| `DEBUG_NOW` | local / QA only | ISO date to pin "now". Ignored in production | No |
| `SUPABASE_SECRET_KEY` | Vercel (Production → prod project, Preview → dev project), `.env.local` | `sb_secret_…`. **Server only** (never `NEXT_PUBLIC_`). Used for one thing: the log-in route checks that an email is on the club list before asking Supabase for a code (runbook G). Every page query still runs as the visitor under RLS | **Yes** |

The template is in `.env.example`. Real values live only in Vercel and in each developer's `.env.local`.

## 3. Deploy runbook (first time, Milestone 1)

Order: **A GitHub → B Vercel → B2 domain** can happen now. **C Supabase → D connect** can come later; the site deploys before Supabase exists and shows "we couldn't load the events" until D is done.

### A. GitHub: org + public repo + push (~10 min)
1. Sign in at github.com → avatar (top right) → **Your organizations** → **New organization** → **Free**.
2. Organization name: `tau-ai-club`. Contact email: the club's shared email. "Belongs to": **My personal account**. Click **Next** and skip inviting members for now.
3. In the new org: **Repositories** → **New repository**.
   - Owner: `tau-ai-club`. Name: `site`. Visibility: **Public**. Vercel Hobby can't deploy private org repos, and there are no secrets in the code.
   - Do **not** add a README, .gitignore or license (the repo must start empty). Click **Create repository**.
4. On this computer, in the project folder:
   ```bash
   git remote add origin https://github.com/tau-ai-club/site.git
   ```
   ```bash
   git push -u origin main
   ```
   Also push the working branch, so it gets a preview deploy:
   ```bash
   git push -u origin feat/home-visual-pass
   ```
   If git asks for credentials, sign in through the browser window Git Credential Manager opens.
5. Check that github.com/tau-ai-club/site shows the code, with `main` as the default branch (**Settings → General → Default branch**).
6. Optional, recommended: **Settings → Branches → Add branch ruleset** for `main`, with "Require a pull request before merging".
7. Later: **People → Invite member** for at least one more board member as **Owner**.

### B. Vercel: import + settings (~15 min, no Supabase needed)
1. Go to vercel.com → **Sign Up** → **Hobby** → **Continue with GitHub** (use the same GitHub account as step A).
2. **Add New… → Project**. Under "Import Git Repository", open the account dropdown → **Add GitHub Account**. Install the Vercel app on the **`tau-ai-club`** org, choose **Only select repositories → `site`**, then **Install**.
3. Back in Vercel, click **Import** next to `tau-ai-club/site`.
   - Project name: `tau-ai-club`. This gives the fallback URL `tau-ai-club.vercel.app`; if the name is taken, Vercel adds a suffix. Note it. The real production URL is `https://tauaiclub.com` (step B2).
   - Framework preset: **Next.js** (auto-detected). Root directory: `./`. Leave the build and install commands at their defaults.
   - **Environment Variables** (you can also add them later under Settings):
     - `ENABLE_EXPERIMENTAL_COREPACK` = `1` for all environments. This makes Vercel use the exact pnpm from `package.json` (`pnpm@12.18.0`).
     - `NEXT_PUBLIC_SITE_URL` = `https://tauaiclub.com` (no trailing slash), **Production only**. Leave it unset for Preview and Development.
     - *Optional until step D:* `USE_FIXTURES` = `1` for **Preview only**, so preview links show the seed season. Production ignores it.
   - Click **Deploy**. The first build takes ~1–2 min.
4. If the build fails at the install step with a pnpm/Corepack error: Settings → Environment Variables → delete `ENABLE_EXPERIMENTAL_COREPACK`, then Deployments → ⋯ → **Redeploy**. Vercel's own pnpm reads our v9 lockfile fine.
5. **Settings → Build and Deployment → Node.js Version: 24.x** (matches local).
6. **Settings → General → Vercel Toolbar:** set **Production → Off** (Preview may stay On). Nothing in the code injects the toolbar (`@vercel/toolbar` is not installed), so this setting is the only switch.
7. **Settings → Deployment Protection:** Hobby defaults to **Standard Protection**: preview URLs need a Vercel login, and the production domain is public. Keep it. QA runs against production or locally, or the previews owner shares a link.
8. **Settings → Git:** Production Branch = `main`. Every other branch gets a Preview deploy automatically.
9. Open `https://tau-ai-club.vercel.app`. You should see the site, with the "couldn't load the events" message until step D.

### B1. Temporary seed launch (until Supabase exists)
**Temporary until Supabase; remove after migration.** To launch M1 before the Supabase projects exist, the site can serve the season from the committed seed data. In Vercel → **Settings → Environment Variables**, set exactly:

| Key | Value | Environments |
|---|---|---|
| `DATA_SOURCE` | `seed` | Production, Preview |
| `NEXT_PUBLIC_SITE_URL` | `https://tauaiclub.com` | Production only |
| `ENABLE_EXPERIMENTAL_COREPACK` | `1` | all |

Leave `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` **unset** in this mode, and don't set `USE_FIXTURES` (production ignores it anyway). Redeploy (Deployments → ⋯ → **Redeploy**) after changing variables. Home, event pages, the calendar feed (`/calendar.ics`), `sitemap.xml` and OG images all come from the seed. The function logs say `DATA_SOURCE=seed` so nobody mistakes it for live data.

What it means: event changes need a code change (edit `supabase/seed.sql`, run `pnpm db:fixtures`, commit, push). **After step D** (Supabase connected): delete `DATA_SOURCE` from Vercel, redeploy, check the site still shows the season, then remove `seedMode()` from `src/lib/events.ts` and this section.

### B2. Custom domain `tauaiclub.com` (~10 min + DNS wait)
Goal: `https://tauaiclub.com` serves production, `www.tauaiclub.com` redirects to it, and `tau-ai-club.vercel.app` keeps working as a fallback.
1. Vercel → project → **Settings → Domains** → **Add Domain**. Enter `tauaiclub.com` → **Add**.
2. When Vercel offers the recommended setup, choose **"Add `www.tauaiclub.com` and redirect it to `tauaiclub.com`"**. If it doesn't offer it, add `www.tauaiclub.com` separately, then edit it and set **Redirect to** `tauaiclub.com` (308, permanent).
3. Both domains now show **Invalid Configuration**, with the DNS records to set. Copy the **exact** values Vercel shows; they can be project-specific:
   - `tauaiclub.com` (apex): an **A** record, Name `@`, Value = the IP Vercel shows.
   - `www.tauaiclub.com`: a **CNAME**, Name `www`, Value = the target Vercel shows (ends in `vercel-dns…com`).
4. At the registrar (GoDaddy: **My Products → Domains → `tauaiclub.com` → DNS → DNS Records**), signed in with the account that bought the domain:
   - Delete the existing **A `@`** record (GoDaddy's "Parked" page) and the existing **CNAME `www` → `@`**.
   - Add the A record and the CNAME from step 3. TTL: 600 seconds (or the lowest offered).
   - Make sure **Forwarding** (Domain → Forwarding) is **off**, and leave the nameservers as they are (GoDaddy's).
   - If there is an existing **CAA** record, it must allow `letsencrypt.org`, or Vercel can't issue the certificate. With no CAA record, nothing needs doing.
5. Back in Vercel → Domains: within minutes (occasionally up to a few hours) both domains turn **Valid Configuration**, and Vercel issues HTTPS certificates automatically.
6. Make sure `NEXT_PUBLIC_SITE_URL` = `https://tauaiclub.com` is set for Production (B.3), then **Redeploy** production. Canonical links, the sitemap, `robots.txt` and share cards use this value, and it is baked in at build time.
7. Check that `https://tauaiclub.com` loads, `https://www.tauaiclub.com` redirects to it, and `https://tau-ai-club.vercel.app` still loads (its canonical points at `tauaiclub.com`).

### C. Supabase: org + two projects + schema + seed (~25 min)
**Free-plan limit:** a free account can own only **2 active free projects**. The user's personal account already has 2, so:
- **Preferred:** a committee member creates the club org (they then own the free quota), using the shared club account if there is one.
- **Or:** pause one personal project (Project → Settings → General → **Pause project**) before creating these.

1. supabase.com/dashboard → **New organization**. Name: `TAU AI Club`. Type: **Educational** (or Personal). Plan: **Free**. Click **Create organization**.
2. **New project** → Org: TAU AI Club. Name: `tau-ai-club-dev`. Database password: **Generate a password** and save it in the club's password manager. Region: **Central EU (Frankfurt)**. Click **Create new project**.
3. Repeat for `tau-ai-club-prod`, with a different generated password.
4. For each project, note its **Project ref**: the `xxxx` in `https://supabase.com/dashboard/project/xxxx` (also under Project Settings → General).
5. **Apply the schema** (on this computer, in the project folder; the CLI opens a browser to sign in):
   ```bash
   npx supabase login
   ```
   ```bash
   npx supabase link --project-ref <DEV_REF>
   ```
   ```bash
   npx supabase db push
   ```
   `link` asks for that project's database password. `db push` lists the migration(s) and asks for confirmation: answer **Y**. Then run the same `link` and `db push` with `<PROD_REF>`.
   *No-CLI alternative:* dashboard → **SQL Editor** → **New query** → paste the whole file `supabase/migrations/20261112000000_m1_content.sql` → **Run**. (The CLI is better because it records which migrations ran.)
6. **Seed the season:** first fix the `-- REVIEW` rows in `supabase/seed.sql` (names, venues, dates). Then in each project: **SQL Editor** → **New query** → paste the whole file `supabase/seed.sql` → **Run**. It should report success. Run it **once** per project; running it twice fails on duplicate slugs, which is safe because it is one transaction.
   Then, the same way, paste and run `supabase/seed-m3-content.sql` (the opening lecture's write-up and the workshops' prep checklists). `supabase db reset` on a local stack runs both seeds by itself (`config.toml`).
7. Check: **Table Editor → events** shows 9 rows with `status = published`, and **event_content** shows 19 rows.
   Upload the opening lecture's PDF: **Storage → event-files → New folder** `cohort-02-opening` → **Upload** `brand/AI_past_and_future_Shai_Yahal.pdf` (the object name must be exactly `cohort-02-opening/AI_past_and_future_Shai_Yahal.pdf`, the path the seed lists). Or, once you're an admin, upload it on `/admin/content` → the opening lecture → **Files**.
8. **Get the URL and key** (per project): the **Connect** button at the top of the project (or **Project Settings → API Keys**):
   - **Project URL**: `https://<ref>.supabase.co`
   - **Publishable key**: `sb_publishable_…`. If the project only shows legacy keys, use the **anon public** key; it works the same.
   - Never copy the **secret** / **service_role** key into Vercel for M1.
9. **Authentication → URL Configuration** and the Google provider: see **F** (Milestone 2).

### D. Connect Vercel to Supabase (~5 min)
1. Vercel → project → **Settings → Environment Variables**. Add each variable with the right environment checkboxes:

   | Key | Value | Environments |
   |---|---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | prod Project URL | **Production** |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | prod publishable key | **Production** |
   | `NEXT_PUBLIC_SUPABASE_URL` | dev Project URL | **Preview**, **Development** |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | dev publishable key | **Preview**, **Development** |

   Delete `USE_FIXTURES` if you added it in B.3, and **`DATA_SOURCE`** if you launched in seed mode (B1); otherwise the site keeps serving the seed instead of Supabase.
2. `NEXT_PUBLIC_*` values are baked in at build time, so env changes need a **Redeploy**: Deployments → latest Production → ⋯ → **Redeploy** (untick "Use existing build cache"). Do the same for the latest Preview.
3. Local dev: create `.env.local` from `.env.example` with the **dev** values, or run `npx vercel env pull .env.local` after `npx vercel link`.

### E. Verify (~5 min)
- `https://tauaiclub.com` shows the hero, the **Next event** card (the next Wednesday meetup) and the season dial, in Hebrew. `/en` shows English.
- `/robots.txt` shows `Allow: /` on production (previews show `Disallow: /`). `/sitemap.xml` lists the events.
- `https://www.tauaiclub.com` redirects to `https://tauaiclub.com`, and the page's `<link rel="canonical">` starts with `https://tauaiclub.com`.
- Paste `https://tauaiclub.com` into a WhatsApp chat: the preview shows the TAU AI Club card.
- No Vercel toolbar on production (open it in a private window).
- Edit one event title in Supabase **prod**: the site updates within 5 minutes.
- Tell QA the production URL (`https://tauaiclub.com`), so they can run `qa/TEST-PLAN.md` against it.

### F. Milestone 2: Google sign-in + allowlist (~30 min)
Needs C and D done. **Superseded by G** (email codes); kept for reference and for the dormant Google path. The allowlist (`member_emails`) decides who is a member.

**F1. Google Cloud OAuth client** (one client serves both Supabase projects), signed in as the club Google account:
1. console.cloud.google.com → project picker → **New project** → Name `tau-ai-club` → **Create**, then select it.
2. **APIs & Services → OAuth consent screen** (Google Auth Platform) → **Get started**:
   - App name `TAU AI Club`, user support email = the club email. Audience: **External**. Contact email = the club email. Agree, **Create**.
   - **Branding**: home page `https://tauaiclub.com`. **Authorized domains**: `tauaiclub.com` and `supabase.co`.
   - **Data access**: only `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`. They are non-sensitive, so Google doesn't need to verify the app.
   - **Audience → Publish app** (status **In production**). While it says "Testing", only listed test users can sign in.
3. **Clients → Create client** → type **Web application**, name `tau-ai-club-supabase`:
   - **Authorized JavaScript origins**: `https://tauaiclub.com`, `https://tau-ai-club.vercel.app`, `http://localhost:3000`.
   - **Authorized redirect URIs**: `https://<DEV_REF>.supabase.co/auth/v1/callback` and `https://<PROD_REF>.supabase.co/auth/v1/callback`. Google sends people back to Supabase, never straight to our site.
   - **Create**, then save the **Client ID** and **Client secret** in the club password manager. The secret goes only into Supabase (F2), never into the repo or Vercel.

**F2. Supabase Auth** (in **dev** and in **prod**):
1. **Authentication → Sign In / Providers → Google**: **Enable**, paste the Client ID and secret, **Save**. The callback URL shown there must be one of the redirect URIs from F1.
2. Same page: turn **off** Email, Phone and **Anonymous sign-ins**. The database trusts only confirmed emails (`auth.users.email_confirmed_at`), so other sign-ups couldn't get in anyway, but there's no reason to offer them. Keep **Allow new users to sign up** on: people who aren't on the list still need a session so the site can show them "המועדון סגור לחברים בלבד".
3. **Authentication → URL Configuration**. The app's callback is `/api/auth/callback` (it carries `?locale=…&next=…`, hence the trailing `**`):
   - **prod**: Site URL `https://tauaiclub.com`. Redirect URLs: `https://tauaiclub.com/api/auth/callback**` and `https://tau-ai-club.vercel.app/api/auth/callback**`.
   - **dev**: Site URL `http://localhost:3000`. Redirect URLs: `http://localhost:3000/api/auth/callback**`, `http://localhost:3500/api/auth/callback**` (the M2 worktree's dev port) and `https://tau-ai-club-*.vercel.app/api/auth/callback**` (every preview and branch URL; `*` doesn't cross `.` or `/`).
   - If an earlier version of this runbook had you add broad `/**` patterns, replace them with these.
4. Optional, recommended: **Project Settings → JWT Keys → migrate to asymmetric signing keys**. The site then verifies sessions locally (`getClaims()`) instead of calling Supabase Auth on every request.

**F3. Schema + first admin**:
1. Apply the M2 migration, dev first, then prod: `npx supabase link --project-ref <REF>`, then `npx supabase db push`. It adds `members`, `member_emails`, `profiles`, `speaker_contacts`, `speaker_form_tokens`, the RLS helpers and the RPCs, and makes content tables admin-writable.
2. Bootstrap the first admin once per project in the **SQL Editor** (use your real name and Google email):
   ```sql
   with m as (insert into public.members (full_name, role) values ('Full Name', 'admin') returning id)
   insert into public.member_emails (email, member_id, is_primary) select 'you@gmail.com', id, true from m;
   ```
   Everything after that happens in the site's admin pages. The database refuses to remove or demote the last admin.
3. Sign in at `/login` with that account: you see the first-login welcome, then `/admin/members`.
4. Import the cohort: `/admin/members` → **Import from CSV**, columns `email, full_name, role` (`member` or `admin`; header row optional). A known email is updated; one bad row stops the whole import and nothing is written.

**F4. Verify**:
- A Google account that is **not** on the list signs in and lands on `/members-only` ("המועדון סגור לחברים בלבד" / "Members only"), and can sign out.
- A listed account signs in and sees the welcome once. `/admin/members` is a 404 unless the account is an admin.
- Removing a member in `/admin/members` cuts their access on their next request.
- Hand QA the list under §4 "M2: what to test".

**F5. Switch the members area on**: until now `main` runs with it off (members/admin routes show "בקרוב", no sign-in link). Do F4 on a Preview first (Vercel → Settings → Environment Variables → `AUTH_ENABLED` = `true` for **Preview**, redeploy the branch). Then add it for **Production** and **Redeploy**: the header is cached (ISR), so the sign-in link appears only after a redeploy. To switch it off again, delete the variable and redeploy. `DATA_SOURCE=seed` always keeps it off, so delete that first (step D).

### G. Members launch: email-code log-in, members' area, member import (~40 min)
Replaces Google as the way in (the Google path in F stays in the code, dormant). One "כניסה לחברים · Member log in" page at `/login`: the person types their email; **only an email on the club list gets a code**; they type the 6-digit code and they're in. There is **no public sign-up**: on a listed member's first login Supabase creates their user, and nobody else can get one. Every email gets the same answer ("If this email is on the club list, a code is on its way. Didn't get one? Contact the club."), so the form can't be used to find out who is a member.

Two gates, both must stay: the site checks the list with `SUPABASE_SECRET_KEY` before it asks Supabase for a code, and the database hook `public.hook_before_user_created` refuses to create a user whose email isn't on the list (if the key is missing, the hook alone still blocks new outsiders).

**G1. Migration** (dev first, then prod): `20261119000000_members_launch.sql`. Adds `profiles.program`, the private `member_contacts` table (phone, contact email, two "show to other members" toggles, both **off** by default, readable only through RPCs) and the auth hook function.

**G2. Gmail SMTP** (club account `tauaiclub＠gmail.com`; Supabase's built-in mailer only sends to the team and is capped at a few emails an hour):
1. On the Google account: turn on **2-Step Verification**, then **Security → App passwords** → create one named "Supabase". Keep it in the club password manager.
2. Supabase → **Authentication → Emails → SMTP Settings** → **Enable custom SMTP**: host `smtp.gmail.com`, port `465`, username = the Gmail address, password = the app password, sender email = the Gmail address, sender name `TAU AI Club`.
3. **Authentication → Rate Limits**: "emails sent per hour" can go up to about `100` now (Gmail allows ~500 a day). Leave the OTP limits at their defaults.

**G3. Email provider and codes** (dev and prod): **Authentication → Sign In / Providers → Email**: **Enable**, keep **Confirm email** on, **Email OTP length** `6`, **Email OTP expiration** `600` seconds. Keep **Allow new users to sign up** on: it's how a listed member's first login creates their user, and the hook refuses every email that isn't on the list. Phone and Anonymous stay off.

**G4. Email templates** (**Authentication → Emails → Templates**): put the same text in **Magic Link** (sent to returning members) **and** **Confirm signup** (Supabase's name for the email sent on a member's first login). Codes only, no link: don't use `{{ .ConfirmationURL }}`.

Subject:
```
קוד הכניסה שלך למועדון ה-AI · Your TAU AI Club code
```
Body (HTML):
```html
<div dir="rtl" lang="he" style="font-family:Arial,sans-serif">
  <h2>קוד הכניסה שלך</h2>
  <p>היי, זה הקוד לכניסה לאתר מועדון ה-AI של אוניברסיטת תל אביב:</p>
  <p dir="ltr" style="font-size:28px;font-weight:bold;letter-spacing:6px">{{ .Token }}</p>
  <p>הקוד תקף ל-10 דקות. לא ביקשת להיכנס? אפשר פשוט להתעלם מהמייל הזה.</p>
</div>
<hr>
<div dir="ltr" lang="en" style="font-family:Arial,sans-serif">
  <h2>Your log-in code</h2>
  <p>Here's your code for the TAU AI Club website:</p>
  <p style="font-size:28px;font-weight:bold;letter-spacing:6px">{{ .Token }}</p>
  <p>It works for 10 minutes. Didn't ask to log in? You can ignore this email.</p>
</div>
```

**G5. Auth hook**: **Authentication → Hooks** → **Before User Created** → type **Postgres** → schema `public`, function `hook_before_user_created` → **Create**. The migration already granted it to `supabase_auth_admin` only.

**G6. URL Configuration**: Site URL `https://tauaiclub.com` (prod) / `http://localhost:3000` (dev). Codes need no redirect URL; the `/api/auth/callback**` entries from F2.3 can stay for the dormant Google path.

**G7. Vercel env** (then **Redeploy**: the header is cached):
- `SUPABASE_SECRET_KEY` = Supabase → Project Settings → API Keys → **Secret key** (`sb_secret_…`). Production → prod project, Preview → dev project. **Server only**: never with a `NEXT_PUBLIC_` prefix.
- `AUTH_ENABLED` = `true` (F5), and delete `DATA_SOURCE` (it keeps the members area off).

**G8. Import the cohort** (once, and again whenever the list changes; it's idempotent):
```
python scripts/members-xlsx-to-sql.py ../tau-ai-club-private/members-cohort-02.xlsx ../tau-ai-club-private/members-cohort-02-import.sql
```
It reads the club sheet (header row with `מייל`; `מנהל/ת` → admin, everyone else member; gender ignored) and writes SQL **outside the repo** (it refuses to write inside it). Paste the file into the prod **SQL Editor** and run it. It adds members + emails, prefills faculty / program / year / LinkedIn, and stores phone + contact email (= the list email) with both toggles **off**. Re-running never overwrites what members changed themselves. The script prints problem rows by sheet row number only (e.g. a typo domain such as `gmal.com`: fix the sheet and re-run, or add `--fix-typos`). Never commit the .sql or the sheet.

**G9. Verify** (Preview first):
- An email that isn't on the list gets the same "If this email is on the club list…" screen and **no** email arrives.
- A listed email gets the bilingual code email; the code logs in; first time → welcome → `/me`.
- `/lectures` and `/workshops` send guests to log in (and back after); they're gone from the guest header; event pages and the season stay public.
- `/profile`: phone and contact email are hidden from another member until each toggle is on.
- `/me` shows the member's name, upcoming meetups with "Add to calendar", and the meeting-games card marked "בקרוב / Coming soon" (the games are built outside the team and plug in there later).

## 4. Day-to-day
- **Edit events (M1):** Supabase dashboard → Table Editor → `events` (or SQL). Set `status = 'published'` to show an event. The site updates within 5 minutes. Admin UI comes in M2.
- **Add a Luma link:** fill `events.luma_url` (must start with `https://`). The button appears automatically.
- **Attendance after each meetup (M2):**
  1. At the door, check guests in with the Luma app (Luma's free check-in: scan each guest's QR code, or tap their name).
  2. After the event, on luma.com: the event → **Guests** → **Export CSV** (or the download icon on the guest list).
  3. On the site: `/admin/events/<the event>` → **Attendance from Luma** → pick the file. Check the preview: members who checked in, members who registered but didn't come, and how many non-member guests. Open "Columns read from the file" if numbers look off. Then **Save attendance**.
  4. Uploading again replaces that event's attendance, so a corrected export is fine.
  - The season grid is at `/admin/attendance` (✓/✗ per member per meetup, attendance %, **Export CSV**). Members see their own meetups on `/profile`.
  - **Privacy:** the export contains every guest's name, email and phone. Don't commit it, attach it to issues or share it: the repo is public. Keep exports in `../tau-ai-club-private/` (outside the repo) or delete them after uploading. `.gitignore` blocks `*luma*.csv` and `*guests*.csv` as a safety net. The site stores only members' attendance, plus a count of non-member guests.
- **Lecture and workshop write-ups (M3):** `/admin/content` → pick the event. Each section (lectures: about, summary, learning goals, key takeaways; workshops: before you come, summary, key commands, exercises, resources) has a Hebrew and an English box in Markdown, a **Preview**, **Who can read it** (everyone / members only) and **Draft / Published**. Hebrew is the source: leave English empty and the English page shows the Hebrew text marked "Hebrew only for now" (no machine translation). Only the lecture's "about" text should be public; everything else defaults to members only. PDFs go under **Files** (members only, up to 3 MB, kept in the private `event-files` bucket and downloaded through 60-second links). Workshop material from Oz: paste it into the empty draft sections and publish them.
- **New event from Luma or a flyer (M2):** `/admin/events/new` → "Fill in from Luma or a flyer". The Luma link is the accurate path. A flyer is read in your browser, which is good at dates, times, links, and venues and speakers already on the site, and weak at titles (offered as suggestions). Marked fields came from the import: check them, then save (it saves as a draft). Free: no AI and no API key. The browser loads Tesseract, its language data and MediaPipe from cdn.jsdelivr.net (pinned versions).
- **Unknown venue:** leave `venue_id` empty (the site shows "מיקום ייקבע" / "Venue TBD"). Optionally set `venue_note_he/en` (e.g. "Off campus").
- **Tentative event:** `is_tentative = true` adds a "טנטטיבי" / "Tentative" tag.
- **Members (M2):** `/admin/members`. Add one person, import a CSV, change a role, add a secondary email (e.g. a personal Gmail next to the TAU one), or remove someone. Emails match case-insensitively; enter the exact Google account address (Gmail dots and `+tags` are not merged).
- **Speaker contact details (M2):** `/admin/speakers` → **Create link** → copy it (it's shown only once) and send it to the speaker. It works once and expires (14 days by default, max 60); a new link cancels the previous one. The speaker ticks each field they agree to share. Email and phone are shown only to signed-in members; LinkedIn is public only if they also tick "show it on the public site". If a speaker asks, **Delete details** removes the row for good. Admins see which fields were shared, never the values.
- **Schema change:** add a new file in `supabase/migrations/`, run `pnpm db:check`, open a PR, then `supabase db push` to dev and later to prod.

### M2: what to test (for QA)
Roles: guest, signed-in non-allowlisted, member, admin. Routes, each in he and en: `/login`, `/members-only`, `/welcome`, `/admin/members`, `/admin/speakers`, `/speaker/<token>`, and `/api/auth/signin`, `/api/auth/callback`, `/api/auth/signout`. Database side: `pnpm db:check` runs the RLS suite in `scripts/rls-m2.mjs`.

## 5. Transfer to the next team (yearly)
1. **GitHub:** add the new board members as org owners, then remove the outgoing ones. The repo stays in the org.
2. **Vercel (Hobby is single-user):** the new owner creates their own Vercel Hobby account and imports `tau-ai-club/site`, copying the env vars from §2. Ask the old owner to delete their project, or change its name so the new owner can claim `tau-ai-club.vercel.app`. Then move the domain:
   - The old owner removes `tauaiclub.com` and `www.tauaiclub.com` from their project (Settings → Domains → ⋯ → Remove).
   - The new owner adds them to the new project (runbook B2). Vercel may ask for a **TXT verification record** at the registrar, because the domain was used by another account. Add it, wait for "Valid", then remove it.
   - The A/CNAME records usually stay the same. If Vercel shows different values, update them at the registrar.
   - Expect a short gap of minutes; do it outside event hours.

   If the club ever upgrades to Pro, use **Project → Settings → Transfer** instead (the domains move with the project).
3. **Supabase:** Organization → Team → invite the new owners as Owner, then remove the outgoing ones. Rotate the database password and the secret API key afterwards.
4. **Google Cloud (M2):** add the new owners to the project IAM as Owner. The OAuth client stays the same. If the client secret may have leaked, add a new secret to the client, paste it into both Supabase projects (F2.1), then delete the old one.
5. **Shared club Google account + password manager:** hand them over in person, and rotate the passwords.
6. **Domain `tauaiclub.com`:** make sure it sits in a **club-owned** registrar account. If it was bought on a personal GoDaddy account, use GoDaddy's **Transfer to another GoDaddy account** (account change, not a registrar transfer). Check that auto-renew is on and that the renewal card or credit belongs to the club. Note the renewal date in §1. Moving to another registrar is possible only 60 days after purchase (from ~2027-01-09), and the DNS records must be recreated there first.
7. Update §1 of this file with the new owners and date.

## 6. Where things are documented
- `CLAUDE.md`: conventions, folders, i18n/RTL, security and caching rules.
- `docs/PLAN.md`: scope, schema design, milestones.
- `docs/hosting-options.md`: Vercel vs Cloudflare, custom domain steps.
- `qa/TEST-PLAN.md`: what QA checks before each milestone.
- `brand/brand-tokens.md`: brand source of truth.
