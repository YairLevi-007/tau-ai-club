import type { Metadata } from "next";
import { routing, type Locale } from "@/i18n/routing";

/** Static brand share image (scripts/make-brand-images.py). Dynamic per-event OG images are in the backlog. */
export const OG_IMAGE = { url: "/og/og-default.png", width: 1200, height: 630 } as const;

export const ogLocale: Record<Locale, string> = { he: "he_IL", en: "en_US" };

/** Locale-prefixed path: he has no prefix, en lives under /en. `path` starts with "/". */
export function localizedPath(locale: Locale, path: string) {
  if (locale === routing.defaultLocale) return path;
  return path === "/" ? `/${locale}` : `/${locale}${path}`;
}

/** canonical + hreflang alternates (he, en, x-default → he) for a locale-free path. */
export function alternatesFor(locale: Locale, path: string): Metadata["alternates"] {
  return {
    canonical: localizedPath(locale, path),
    languages: {
      he: localizedPath("he", path),
      en: localizedPath("en", path),
      "x-default": localizedPath("he", path),
    },
  };
}

/** Open Graph + Twitter blocks. Page-level openGraph replaces the layout's, so always build both here. */
export function shareMetadata(opts: {
  locale: Locale;
  path: string;
  title: string;
  description?: string;
  siteName: string;
  imageAlt: string;
  type?: "website" | "article";
}): Pick<Metadata, "openGraph" | "twitter"> {
  const { locale, path, title, description, siteName, imageAlt, type = "website" } = opts;
  const image = { ...OG_IMAGE, alt: imageAlt };
  return {
    openGraph: {
      type,
      siteName,
      title,
      description,
      url: localizedPath(locale, path),
      locale: ogLocale[locale],
      alternateLocale: routing.locales.filter((l) => l !== locale).map((l) => ogLocale[l]),
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}
