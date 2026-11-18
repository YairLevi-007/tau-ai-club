import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["he", "en"],
  defaultLocale: "he",
  // Hebrew lives at `/`, English at `/en/...`.
  localePrefix: "as-needed",
  // Visitors always land on Hebrew at `/`. Their choice is remembered via the
  // NEXT_LOCALE cookie only after they pick a language with the switcher.
  localeDetection: false,
  // No `Link:` hreflang response header: it uses the request origin, not SITE_URL
  // (QA audit N6). The same alternates are in each page's <head> and in sitemap.xml.
  alternateLinks: false,
});

export type Locale = (typeof routing.locales)[number];

export const localeDir: Record<Locale, "rtl" | "ltr"> = {
  he: "rtl",
  en: "ltr",
};

/** All event times are Israel time, whatever the viewer's timezone. */
export const TIME_ZONE = "Asia/Jerusalem";
