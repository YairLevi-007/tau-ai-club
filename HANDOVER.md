# HANDOVER (v1.1, 2026-11-13)

How the TAU AI Club site runs, what it depends on, and how to hand it to the next club team.
Keep this file current: whoever adds a service or env var updates it in the same PR.

## 1. Services

| Service | What for | Account / owner (target) | Plan | Status |
|---|---|---|---|---|
| GitHub | Code, PRs, Vercel's git source | Org `tau-ai-club`, repo `tau-ai-club/site` (**public**: Vercel Hobby can't deploy private org repos) | Free | ⏳ to create |
| Vercel | Hosting, preview deploys | Hobby account of a club admin, project `tau-ai-club` → `tau-ai-club.vercel.app` | Hobby (non-commercial only: no ads, no paid work on the site) | ⏳ to create |
| Supabase | Postgres, RLS, Auth (M2) | Dedicated org "TAU AI Club", projects `tau-ai-club-dev` and `tau-ai-club-prod` | Free (projects pause after ~7 days without traffic; dev may pause, prod gets daily traffic) | ⏳ to create |
| Google Cloud | OAuth client for "Sign in with Google" (M2) | Project `tau-ai-club`, owned by the club Google account | Free | M2 |
| Luma | Event registration (we only link to it) | Club's Luma calendar | Free | exists |
| Domain `tauaiclub.com` | Future custom domain | GoDaddy, registered 2026-11-10, expires 2027-11-10. **Owner to confirm** | Paid yearly | not in use (see `docs/hosting-options.md`) |

Every service should be owned by a **club account** (e.g. a shared `tau.ai.club@…` Google account), with at least two current board members as admins. Personal accounts are only a bootstrap.

## 2. Environment variables

| Name | Where | Value | Secret? |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel (Production → prod project; Preview + Development → dev project), `.env.local` | `https://<ref>.supabase.co` | No |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | same | `sb_publishable_…` (Supabase → Project Settings → API Keys) | No (RLS protects data) |
| `NEXT_PUBLIC_SITE_URL` | Vercel Production (optional) | `https://tau-ai-club.vercel.app` | No |
| `ENABLE_EXPERIMENTAL_COREPACK` | Vercel, all environments | `1` (use the exact pnpm from `packageManager`) | No |
| `USE_FIXTURES` | local / QA only | `1` = use seed fixtures without Supabase. Ignored in production | No |
| `DEBUG_NOW` | local / QA only | ISO date to pin "now". Ignored in production | No |
| `SUPABASE_SECRET_KEY` | **M2+, server only**, never `NEXT_PUBLIC_` | `sb_secret_…` | **Yes** |

The template is in `.env.example`. Real values live only in Vercel and in each developer's `.env.local`.

## 3. Deploy runbook (first time, Milestone 1)

Order: **A GitHub → B Vercel** can happen now. **C Supabase → D connect** can come later; the site deploys before Supabase exists and shows "we couldn't load the events" until D is done.

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
   - Project name: `tau-ai-club`. This gives `tau-ai-club.vercel.app`; if the name is taken, Vercel adds a suffix. Note the final URL.
   - Framework preset: **Next.js** (auto-detected). Root directory: `./`. Leave the build and install commands at their defaults.
   - **Environment Variables** (you can also add them later under Settings):
     - `ENABLE_EXPERIMENTAL_COREPACK` = `1` for all environments. This makes Vercel use the exact pnpm from `package.json` (`pnpm@12.18.0`).
     - `NEXT_PUBLIC_SITE_URL` = `https://tau-ai-club.vercel.app` (your final URL), **Production only**.
     - *Optional until step D:* `USE_FIXTURES` = `1` for **Preview only**, so preview links show the seed season. Production ignores it.
   - Click **Deploy**. The first build takes ~1–2 min.
4. If the build fails at the install step with a pnpm/Corepack error: Settings → Environment Variables → delete `ENABLE_EXPERIMENTAL_COREPACK`, then Deployments → ⋯ → **Redeploy**. Vercel's own pnpm reads our v9 lockfile fine.
5. **Settings → Build and Deployment → Node.js Version: 24.x** (matches local).
6. **Settings → General → Vercel Toolbar:** set **Production → Off** (Preview may stay On). Nothing in the code injects the toolbar (`@vercel/toolbar` is not installed), so this setting is the only switch.
7. **Settings → Deployment Protection:** Hobby defaults to **Standard Protection**: preview URLs need a Vercel login, and the production domain is public. Keep it. QA runs against production or locally, or the previews owner shares a link.
8. **Settings → Git:** Production Branch = `main`. Every other branch gets a Preview deploy automatically.
9. Open the production URL. You should see the site, with the "couldn't load the events" message until step D.

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
7. Check: **Table Editor → events** shows 9 rows with `status = published`.
8. **Get the URL and key** (per project): the **Connect** button at the top of the project (or **Project Settings → API Keys**):
   - **Project URL**: `https://<ref>.supabase.co`
   - **Publishable key**: `sb_publishable_…`. If the project only shows legacy keys, use the **anon public** key; it works the same.
   - Never copy the **secret** / **service_role** key into Vercel for M1.
9. **Authentication → URL Configuration** (needed in M2, harmless now):
   - **prod**: Site URL = `https://tau-ai-club.vercel.app`.
   - **dev**: Site URL = `http://localhost:3000`, and add `https://tau-ai-club-*.vercel.app/**` to Redirect URLs.

### D. Connect Vercel to Supabase (~5 min)
1. Vercel → project → **Settings → Environment Variables**. Add each variable with the right environment checkboxes:

   | Key | Value | Environments |
   |---|---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | prod Project URL | **Production** |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | prod publishable key | **Production** |
   | `NEXT_PUBLIC_SUPABASE_URL` | dev Project URL | **Preview**, **Development** |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | dev publishable key | **Preview**, **Development** |

   Delete `USE_FIXTURES` if you added it in B.3.
2. `NEXT_PUBLIC_*` values are baked in at build time, so env changes need a **Redeploy**: Deployments → latest Production → ⋯ → **Redeploy** (untick "Use existing build cache"). Do the same for the latest Preview.
3. Local dev: create `.env.local` from `.env.example` with the **dev** values, or run `npx vercel env pull .env.local` after `npx vercel link`.

### E. Verify (~5 min)
- The production URL shows the hero, the **Next event** card (the next Wednesday meetup) and the season dial, in Hebrew. `/en` shows English.
- `/robots.txt` shows `Allow: /` on production (previews show `Disallow: /`). `/sitemap.xml` lists the events.
- Paste the production URL into a WhatsApp chat: the preview shows the TAU AI Club card.
- No Vercel toolbar on production (open it in a private window).
- Edit one event title in Supabase **prod**: the site updates within 5 minutes.
- Tell QA the production URL, so they can run `qa/TEST-PLAN.md` against it.

## 4. Day-to-day
- **Edit events (M1):** Supabase dashboard → Table Editor → `events` (or SQL). Set `status = 'published'` to show an event. The site updates within 5 minutes. Admin UI comes in M2.
- **Add a Luma link:** fill `events.luma_url` (must start with `https://`). The button appears automatically.
- **Unknown venue:** leave `venue_id` empty (the site shows "מיקום ייקבע" / "Venue TBD"). Optionally set `venue_note_he/en` (e.g. "Off campus").
- **Tentative event:** `is_tentative = true` adds a "טנטטיבי" / "Tentative" tag.
- **Schema change:** add a new file in `supabase/migrations/`, run `pnpm db:check`, open a PR, then `supabase db push` to dev and later to prod.

## 5. Transfer to the next team (yearly)
1. **GitHub:** add the new board members as org owners, then remove the outgoing ones. The repo stays in the org.
2. **Vercel (Hobby is single-user):** the new owner creates their own Vercel Hobby account and imports `tau-ai-club/site`, copying the env vars from §2. Ask the old owner to delete their project, or change its name so the new owner can claim `tau-ai-club.vercel.app`. If a custom domain is used later, move it in Vercel → Domains. If the club ever upgrades to Pro, use **Project → Settings → Transfer** instead.
3. **Supabase:** Organization → Team → invite the new owners as Owner, then remove the outgoing ones. Rotate the database password and the secret API key afterwards.
4. **Google Cloud (M2):** add the new owners to the project IAM as Owner. The OAuth client stays the same.
5. **Shared club Google account + password manager:** hand them over in person, and rotate the passwords.
6. **Domain (if used):** change the GoDaddy account owner, or move the domain to the club's registrar account.
7. Update §1 of this file with the new owners and date.

## 6. Where things are documented
- `CLAUDE.md`: conventions, folders, i18n/RTL, security and caching rules.
- `docs/PLAN.md`: scope, schema design, milestones.
- `docs/hosting-options.md`: Vercel vs Cloudflare, custom domain steps.
- `qa/TEST-PLAN.md`: what QA checks before each milestone.
- `brand/brand-tokens.md`: brand source of truth.
