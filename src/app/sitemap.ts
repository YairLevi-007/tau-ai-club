import type { MetadataRoute } from "next";
import { SITE_URL } from "@/config/site";
import { getEventSlugs, getSeason } from "@/lib/events";
import { contentKindOf } from "@/lib/content/sections";
import { localizedPath } from "@/lib/seo";
import { routing } from "@/i18n/routing";

export const revalidate = 3600;

/** Every public page in both languages, each with hreflang alternates. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const season = await getSeason();
  // Workshops are members only, so only lectures (public blurbs) are listed.
  const lectures = season.status === "ok" ? season.events.filter((e) => contentKindOf(e.kind) === "lecture").map((e) => `/lectures/${e.slug}`) : [];
  const paths = ["/", ...(await getEventSlugs()).map((slug) => `/events/${slug}`), "/lectures", ...lectures];
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
