import type { MetadataRoute } from "next";
import { SITE_URL } from "@/config/site";
import { getSeason } from "@/lib/events";
import { contentKindOf } from "@/lib/content/sections";
import { localizedPath } from "@/lib/seo";
import { routing } from "@/i18n/routing";
import { authEnabled } from "@/lib/supabase/config";

export const revalidate = 3600;

/** Every public page in both languages, each with hreflang alternates. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const season = await getSeason();
  const events = season.status === "ok" ? season.events : [];
  // lastmod: each event's last edit; the home page changes whenever any event does.
  const latest = events.reduce<string | undefined>((m, e) => (!m || e.updated_at > m ? e.updated_at : m), undefined);
  const pages = [
    { path: "/", lastModified: latest },
    // Members area on: meetup pages are members only (the schedule isn't public).
    ...(authEnabled() ? [] : events.map((e) => ({ path: `/events/${e.slug}`, lastModified: e.updated_at }))),
    // Members area off: lectures have a public preview (blurb, speaker, date), so they're listed.
    // Members area on: lectures are members only, like workshops (never listed).
    ...(authEnabled()
      ? []
      : [
          { path: "/lectures", lastModified: latest },
          ...events.filter((e) => contentKindOf(e.kind) === "lecture").map((e) => ({ path: `/lectures/${e.slug}`, lastModified: e.updated_at })),
        ]),
  ];
  const abs = (p: string) => (p === "/" ? SITE_URL : `${SITE_URL}${p}`);

  return pages.flatMap(({ path, lastModified }) =>
    routing.locales.map((locale) => ({
      url: abs(localizedPath(locale, path)),
      ...(lastModified ? { lastModified: new Date(lastModified) } : {}),
      changeFrequency: path === "/" ? ("daily" as const) : ("weekly" as const),
      priority: path === "/" ? 1 : 0.6,
      alternates: {
        languages: Object.fromEntries(routing.locales.map((l) => [l, abs(localizedPath(l, path))])),
      },
    })),
  );
}
