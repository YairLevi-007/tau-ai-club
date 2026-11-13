# HANDOVER (v1, 2026-11-12)

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
| `USE_FIXTURES` | local / QA only | `1` = use seed fixtures without Supabase. Ignored in production | No |
| `DEBUG_NOW` | local / QA only | ISO date to pin "now". Ignored in production | No |
| `SUPABASE_SECRET_KEY` | **M2+, server only**, never `NEXT_PUBLIC_` | `sb_secret_…` | **Yes** |

The template is in `.env.example`. Real values live only in Vercel and in each developer's `.env.local`.

## 3. First-time setup (bootstrap, Milestone 1)

1. **GitHub:** create the org `tau-ai-club` and a public repo `site`. Then:
   ```bash
   git remote add origin https://github.com/tau-ai-club/site.git
   git push -u origin main
   ```
2. **Supabase:** create the org "TAU AI Club" and two projects (region: closest EU, e.g. Frankfurt): `tau-ai-club-dev` and `tau-ai-club-prod`. Save each database password in the club's password manager. Then, for each project:
   ```bash
   npx supabase login
   npx supabase link --project-ref <ref>
   npx supabase db push   # applies supabase/migrations
   ```
   Seed: paste `supabase/seed.sql` into the SQL editor and run it, or `psql "<connection string>" -f supabase/seed.sql`. Fix the `-- REVIEW` rows first.
3. **Vercel:** import the GitHub repo (framework: Next.js; install and build commands auto-detected from pnpm). Set the env vars from §2 per environment. Production branch = `main`. Disable the Vercel Toolbar for Production (Project → Settings → General → Vercel Toolbar).
4. Open `https://tau-ai-club.vercel.app`. The Next event card should show the upcoming event.

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
