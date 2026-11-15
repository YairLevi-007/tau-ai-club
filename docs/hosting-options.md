# Hosting options: Vercel Hobby vs Cloudflare Workers (OpenNext)

**Decision 2026-11-12: Vercel Hobby.** **Update 2026-11-15:** the club bought `tauaiclub.com`, and it becomes the production URL on Vercel: apex `https://tauaiclub.com`, `www` → apex, fallback `tau-ai-club.vercel.app`. DNS stays at the registrar, with an A + CNAME to Vercel (`HANDOVER.md` §3 B2). The rest of this page is the note for a possible later move to Cloudflare.

Researched 2026-11-12 against current docs.

## Recommendation

**Use Cloudflare Workers with `@opennextjs/cloudflare` on the Workers Paid plan ($5/month), with `tauaiclub.com` on Cloudflare DNS.** If nobody will pay $5/month, Vercel Hobby is the safer free option for Milestone 1, but it comes with a licence question and a handover problem (see below).

Why:
- **Vercel Hobby is "non-commercial personal use only."** Vercel defines commercial use as any financial gain for anyone involved: sponsor ads, paid work on the site, selling things. Donations are allowed. A free student club site with no sponsors probably qualifies. Sponsor logos, a paid developer or paid events would break that. "Personal use" is also a poor match for a site the club owns.
- **Vercel Hobby cannot deploy a private repo owned by a GitHub organization.** The handover plan moves the repo to a club GitHub org. On Hobby it would have to be **public**, or the club would need Pro ($20/user/month). Moving a project between two Hobby accounts is also unreliable; in practice the club would redeploy and move the domain.
- **The Cloudflare free plan is too tight for SSR.** It allows 10 ms of CPU per request, and Next.js SSR through OpenNext often goes over that (Error 1102). On the $5 Paid plan the CPU limit goes up to 30 s per request (default; configurable to 5 min) and requests are unlimited, which removes the problem.
- The domain is already one DNS change from Cloudflare (see the last section).

## What works and what doesn't

| | Vercel Hobby | Cloudflare Workers + OpenNext |
|---|---|---|
| App Router, RSC, Server Actions, Route Handlers | Native | Supported (Next 14/15 latest, all of 16) |
| ISR / `revalidate` | Native | Supported. Needs an incremental cache binding (R2 or KV) set up in `open-next.config.ts` |
| Middleware (next-intl locale routing, Supabase session refresh) | Native, including Next 16 `proxy.ts` | **Only the old `middleware.ts` (edge runtime).** Next 16's `proxy.ts` runs on Node and **fails to build** ("Node.js middleware is not currently supported"), as of opennextjs-cloudflare issue #1082. Keep `middleware.ts` until the Adapters API version ships. |
| next-intl | Works | Works through `middleware.ts` (above) |
| Supabase SSR auth (`@supabase/ssr`, cookies) | Works | Works on the Node runtime (`nodejs_compat`). The middleware has to stay edge-compatible, which `@supabase/ssr` is. |
| `next/image` optimisation | Built in. Hobby: 5K transformations/month | Through Cloudflare Images (an `IMAGES` binding). Costs extra beyond its free allowance. Alternative: `unoptimized` plus images that are already the right size. |
| Edge runtime (`export const runtime = 'edge'`) | Works | Don't use it. OpenNext wants the Node runtime. |
| Building on Windows | Fine | Not guaranteed. Build in CI (Workers Builds or GitHub Actions) or WSL. |
| Bundle size | n/a | Limit is 64 MiB uncompressed on all plans (the old 3 MiB free-plan compressed limit was removed on 2026-09-04) |

Cloudflare's own Next.js guide now steers people to **vinext** (a Vite-based reimplementation, in beta). I'd stay on OpenNext, which runs the real Next.js build; vinext is too new for a hard deadline.

## Preview deploys

- **Vercel:** every push and PR gets its own preview URL with a PR comment. Zero setup.
- **Cloudflare Workers Builds:** connect the GitHub repo; each non-production **branch** gets a preview URL (listed in the dashboard, optionally posted as a PR comment). Free plan: 3,000 build minutes/month, 1 concurrent build. Paid: 6,000 minutes, 6 concurrent. Point preview builds at the **dev** Supabase project through per-environment variables.

## Free-tier limits (per month unless noted)

| | Vercel Hobby | Cloudflare Workers Free | Workers Paid ($5) |
|---|---|---|---|
| Requests | 1M function invocations | 100K/day | 10M included, then pay per use |
| CPU | 4 h active CPU | **10 ms per request** | 30 s default, up to 5 min |
| Bandwidth | 100 GB | No egress fee | No egress fee |
| Commercial use | No | Yes | Yes |

A club site's traffic fits comfortably in either. The real constraints are Vercel's licence and Cloudflare's 10 ms CPU limit on the free plan.

## Handover to the club

- **Cloudflare:** add club members to the account (members/roles are free), or create a club-owned account and redeploy from the club's GitHub org. Private org repos work on the free plan. The domain zone moves with the account.
- **Vercel:** needs either a public repo under the org, or a Pro team the club pays for. Moving a project from one Hobby account to another isn't really supported, so the club would redeploy and move the domain.

## Custom domain `tauaiclub.com`

Current state (from RDAP and DNS, 2026-11-12): **registered 2026-11-10 at GoDaddy**, expires 2027-11-10, GoDaddy nameservers, showing a parked page. Registrar transfer is locked (new registrations usually can't change registrar for 60 days, so ~2027-01-09). **We need to confirm who owns the GoDaddy account.** It should end up as a club account.

- **Cloudflare:** add `tauaiclub.com` as a zone (free plan), then change the nameservers at GoDaddy to the two Cloudflare ones. This is allowed despite the transfer lock. After that, add Custom Domains `tauaiclub.com` and `www.tauaiclub.com` on the Worker; Cloudflare creates the DNS records and certificates. Optional: move the registration to Cloudflare Registrar (at-cost pricing) after the 60-day lock ends.
- **Vercel:** add the domain to the project, then at GoDaddy set an `A` record for `@` and a `CNAME` for `www` to the values Vercel shows (or switch the nameservers to Vercel). Custom domains are allowed on Hobby.
- In both cases, update the Supabase Auth Site URL and redirect URLs, and the Google OAuth origins, to `https://tauaiclub.com` (needed for Milestone 2).
- DNS changes can take up to 24–48 h. **Do the nameserver change this week**, well before 2026-11-18.

## Decisions needed

1. Cloudflare Paid ($5/month; who pays?) or Vercel Hobby (free, public repo, licence risk)?
2. Who controls the GoDaddy account for `tauaiclub.com`?

## Sources

- OpenNext Cloudflare: https://opennext.js.org/cloudflare, image how-to: https://opennext.js.org/cloudflare/howtos/image
- Node middleware / proxy.ts: https://github.com/opennextjs/opennextjs-cloudflare/issues/1082
- Workers limits: https://developers.cloudflare.com/workers/platform/limits/, size-limit change: https://developers.cloudflare.com/changelog/post/2026-09-04-increased-worker-size-limit/
- Workers Builds: https://developers.cloudflare.com/workers/ci-cd/builds/ and /limits-and-pricing/
- Workers custom domains: https://developers.cloudflare.com/workers/configuration/routing/custom-domains/
- Cloudflare Next.js guide (vinext): https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/
- Vercel fair use and commercial use: https://vercel.com/docs/limits/fair-use-guidelines
- Vercel Hobby and private org repos: https://community.vercel.com/t/unable-to-deploy-from-organizational-private-repository/16334
- Vercel project transfer: https://vercel.com/docs/projects/transferring-projects
