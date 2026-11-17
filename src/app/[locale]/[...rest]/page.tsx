import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";

// Rendered in one piece (not streamed), so the 404 status is set before anything is sent;
// a streamed render would flush a 200 shell first. See ./layout.tsx.
export const dynamic = "force-static";

/** The 404 page's <title>. With the layout's Suspense boundary, a 404 keeps the metadata of the route that threw it. */
export async function generateMetadata({ params }: PageProps<"/[locale]/[...rest]">): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: "errors" });
  return { title: t("notFoundTitle"), robots: { index: false, follow: false } };
}

/**
 * Any unknown path under a locale (e.g. /nope, /en/nope) lands here and
 * renders the localized [locale]/not-found.tsx inside the site layout.
 */
export default function CatchAll() {
  notFound();
}
