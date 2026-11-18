import { TIME_ZONE, type Locale } from "@/i18n/routing";
import { SITE_URL, SOCIAL } from "@/config/site";
import type { ClubEvent } from "@/lib/data/types";
import { loc } from "@/lib/event-format";
import { OG_IMAGE, localizedPath } from "@/lib/seo";

// schema.org JSON-LD (QA audit S3). Public fields only: titles, dates, venue, speaker
// names. Never speaker contact data.

const abs = (path: string) => (path === "/" ? SITE_URL : `${SITE_URL}${path}`);

/** An ISO timestamp as Israel wall time with its offset, e.g. "2026-11-24T18:00:00+02:00". */
export function jerusalemIso(iso: string) {
  const d = new Date(iso);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TIME_ZONE,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  const wall = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
  const offsetMin = Math.round((Date.parse(`${wall}Z`) - Math.floor(d.getTime() / 1000) * 1000) / 60000);
  const sign = offsetMin < 0 ? "-" : "+";
  const hh = String(Math.floor(Math.abs(offsetMin) / 60)).padStart(2, "0");
  const mm = String(Math.abs(offsetMin) % 60).padStart(2, "0");
  return `${wall}${sign}${hh}:${mm}`;
}

function organizer(locale: Locale, name: string) {
  return { "@type": "Organization", name, url: abs(localizedPath(locale, "/")) };
}

/** The club, for the home page. */
export function organizationJsonLd(locale: Locale, opts: { name: string; description: string }) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: opts.name,
    description: opts.description,
    url: abs(localizedPath(locale, "/")),
    logo: abs("/brand/logo-mark.png"),
    sameAs: [SOCIAL.instagram, SOCIAL.linkedin],
    parentOrganization: { "@type": "CollegeOrUniversity", name: locale === "he" ? "אוניברסיטת תל אביב" : "Tel Aviv University" },
  };
}

/**
 * One meetup as a schema.org Event, or null when it shouldn't have one.
 * A tentative meetup gets none: Google's event rules expect a confirmed date, and
 * there is no status for "planned but not confirmed" (EventPostponed means a set
 * date moved). Its page still says Tentative in the text and the share metadata.
 */
export function eventJsonLd(event: ClubEvent, locale: Locale, opts: { siteName: string; venueTbd: string }) {
  if (event.is_tentative) return null;
  const name = loc(event, "title", locale) ?? event.slug;
  const venueName = event.venue ? loc(event.venue, "name", locale) : loc(event, "venue_note", locale);
  const address = event.venue ? loc(event.venue, "address", locale) : null;
  const performers = event.event_speakers
    .map(({ speaker }) => loc(speaker, "name", locale))
    .filter((n): n is string => !!n)
    .map((n) => ({ "@type": "Person", name: n }));

  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name,
    description: loc(event, "blurb", locale) ?? undefined,
    startDate: jerusalemIso(event.starts_at),
    endDate: jerusalemIso(event.ends_at),
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: {
      "@type": "Place",
      name: venueName ?? opts.venueTbd,
      address: {
        "@type": "PostalAddress",
        ...(address ? { streetAddress: address } : {}),
        addressLocality: locale === "he" ? "תל אביב" : "Tel Aviv",
        addressCountry: "IL",
      },
    },
    image: [abs(OG_IMAGE.url)],
    url: abs(localizedPath(locale, `/events/${event.slug}`)),
    ...(performers.length ? { performer: performers } : {}),
    organizer: organizer(locale, opts.siteName),
  };
}

/** Serialized for a <script type="application/ld+json">: `<` escaped so text can't close the tag. */
export const jsonLdHtml = (data: object) => ({ __html: JSON.stringify(data).replace(/</g, "\\u003c") });
