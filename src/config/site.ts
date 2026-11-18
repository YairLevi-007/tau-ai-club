// Site-level constants that are configuration, not content (content lives in Supabase).

/**
 * Canonical public origin (no trailing slash). Drives metadataBase, canonical +
 * hreflang URLs, Open Graph URLs, sitemap.xml, robots.txt and calendar links.
 *
 *   Production: NEXT_PUBLIC_SITE_URL=https://tauaiclub.com  (set in Vercel, Production only)
 *   Preview:    unset → VERCEL_PROJECT_PRODUCTION_URL (Vercel's production domain), so
 *               previews point canonicals at the real site and stay noindex (see IS_PRODUCTION)
 *   Local:      http://localhost:3000
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000")
).replace(/\/+$/, "");

/**
 * True only on the Vercel Production deployment. Previews and local builds are
 * "not production": they get noindex and allow USE_FIXTURES / DEBUG_NOW.
 */
export const IS_PRODUCTION = process.env.VERCEL_ENV === "production";

export const SOCIAL = {
  instagram: "https://www.instagram.com/tau.ai.club/",
  linkedin: "https://www.linkedin.com/company/tau-ai-club/",
} as const;

/** How often public pages re-render (seconds). The Next event card can lag its 20:00 switch by up to this. */
export const PUBLIC_REVALIDATE_SECONDS = 300;
