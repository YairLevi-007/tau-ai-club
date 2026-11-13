import type { MetadataRoute } from "next";
import { SITE_URL } from "@/config/site";
import { getEventSlugs } from "@/lib/events";
import { localizedPath } from "@/lib/seo";
import { routing } from "@/i18n/routing";

export const revalidate = 3600;

/** Every public page in both languages, each with hreflang alternates. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const paths = ["/", ...(await getEventSlugs()).map((slug) => `/events/${slug}`)];
  const abs = (p: string) => (p === "/" ? SITE_URL : `${SITE_URL}${p}`);

  return paths.flatMap((path) =>
    routing.locales.map((locale) => ({
      url: abs(localizedPath(locale, path)),
      changeFrequency: path === "/" ? ("daily" as const) : ("weekly" as const),
      priority: path === "/" ? 1 : 0.6,
      alternates: {
        languages: Object.fromEntries(routing.locales.map((l) => [l, abs(localizedPath(l, path))])),
      },
    })),
  );
}
