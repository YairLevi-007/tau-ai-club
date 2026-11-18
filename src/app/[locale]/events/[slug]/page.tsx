import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, ArrowUpRight, MapPin } from "lucide-react";
import { routing, type Locale } from "@/i18n/routing";
import { TIME_ZONE } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { getEventBySlug, getEventSlugs, getSeason } from "@/lib/events";
import {
  formatEventDate,
  formatShortDate,
  formatTimeRange,
  isoAttr,
  loc,
  speakerNames,
  venueIsTbd,
  venueLabel,
} from "@/lib/event-format";
import { jlmDay } from "@/lib/season-ruler";
import { alternatesFor, shareMetadata } from "@/lib/seo";
import { eventJsonLd, jsonLdHtml } from "@/lib/structured-data";
import { cn } from "@/lib/utils";
import { EventActions, Tag } from "@/components/events/event-bits";
import { SpeakerFace, initialsOf } from "@/components/events/speaker-face";
import { SpeakerLinkedIn } from "@/components/events/speaker-linkedin";

export const revalidate = 300;

export async function generateStaticParams() {
  const slugs = await getEventSlugs();
  return routing.locales.flatMap((locale) => slugs.map((slug) => ({ locale, slug })));
}

export async function generateMetadata({ params }: PageProps<"/[locale]/events/[slug]">): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const event = await getEventBySlug(slug);
  if (!event) {
    // This page 404s: title it like the 404 page (the route that throws keeps its metadata).
    const tErr = await getTranslations({ locale, namespace: "errors" });
    return { title: tErr("notFoundTitle"), robots: { index: false, follow: false } };
  }
  // Public fields only (title, date, venue, speaker names, blurb). Never speaker contact data.
  const [t, te] = await Promise.all([
    getTranslations({ locale, namespace: "meta" }),
    getTranslations({ locale, namespace: "event" }),
  ]);
  const title = loc(event, "title", locale) ?? "";
  const when = `${formatEventDate(event.starts_at, locale)} · ${formatTimeRange(event.starts_at, event.ends_at)}`;
  const where = venueLabel(event, locale) ?? te("venueTbd");
  const who = speakerNames(event, locale).join(", ");
  // A tentative meetup says so first, so a link preview doesn't read as confirmed (QA audit S4).
  const tentative = event.is_tentative ? te("tentative") : null;
  const description = [tentative, when, where, who, loc(event, "blurb", locale)].filter(Boolean).join(" · ");
  const path = `/events/${slug}`;
  return {
    title,
    description,
    alternates: alternatesFor(locale, path),
    ...shareMetadata({
      locale,
      path,
      title: `${tentative ? `${title} (${tentative})` : title} · ${t("siteName")}`,
      description,
      siteName: t("siteName"),
      imageAlt: t("ogAlt"),
      type: "article",
    }),
  };
}

const intlLocale: Record<Locale, string> = { he: "he-IL", en: "en-GB" };

/**
 * One meetup. Same world as the home page: the logo grid backdrop, a featured
 * "ticket" with the date and actions (static, visible at first paint), and
 * speakers with faces. A past meetup reads as past: a Past tag, a written note,
 * no glow, a plain ticket and no calendar/registration actions.
 */
export default async function EventPage({ params }: PageProps<"/[locale]/events/[slug]">) {
  const { locale, slug } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const l = locale as Locale;

  const [event, season] = await Promise.all([getEventBySlug(slug), getSeason()]);
  if (!event || season.status !== "ok") notFound();
  const [t, te, tm] = await Promise.all([
    getTranslations("eventPage"),
    getTranslations("event"),
    getTranslations("meta"),
  ]);
  const jsonLd = eventJsonLd(event, l, { siteName: tm("siteName"), venueTbd: te("venueTbd") });

  const past = event.state === "past";
  const live = event.state === "live";
  const dayDiff = jlmDay(event.starts_at) - jlmDay(season.now);
  const today = dayDiff === 0 && !past;
  const relative = live
    ? te("happeningNow")
    : dayDiff >= 0
      ? te("relativeDays", { days: dayDiff })
      : te("relativePast", { days: -dayDiff });

  const title = loc(event, "title", l) ?? event.slug;
  const blurb = loc(event, "blurb", l);
  const venue = venueLabel(event, l);
  const address = event.venue ? loc(event.venue, "address", l) : null;
  const speakers = event.event_speakers.map(({ speaker }) => {
    const name = loc(speaker, "name", l) ?? "";
    return {
      key: speaker.id,
      name,
      initials: initialsOf(name),
      photoUrl: speaker.photo_url,
      linkedinUrl: speaker.linkedin_url,
      role: [loc(speaker, "role", l), loc(speaker, "company", l)].filter(Boolean).join(" · ") || null,
    };
  });
  const hasBody = !!blurb || speakers.length > 0;
  const seriesTotal = event.series ? season.events.filter((e) => e.series === event.series).length : 0;

  const index = season.events.findIndex((e) => e.slug === event.slug);
  const prev = index > 0 ? season.events[index - 1] : null;
  const next = index >= 0 && index < season.events.length - 1 ? season.events[index + 1] : null;

  const weekday = new Intl.DateTimeFormat(intlLocale[l], { timeZone: TIME_ZONE, weekday: "long" }).format(
    new Date(event.starts_at),
  );
  const Back = l === "he" ? ArrowRight : ArrowLeft; // points toward inline-start
  const Forward = l === "he" ? ArrowLeft : ArrowRight;

  return (
    <div className="relative isolate">
      {/* Backdrop: the logo grid, and the glow only while the meetup is still ahead. Decorative, static. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-16 -z-10 h-[34rem] overflow-hidden">
        <div className="hero-grid absolute inset-0" />
        {!past && <div className="hero-glow absolute inset-0" />}
        <i className="absolute end-[8%] top-[8rem] size-3.5 bg-brand-purple" />
        <i className="absolute hidden lg:block start-[5%] top-[18rem] size-7 bg-logo-indigo" />
      </div>

      {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdHtml(jsonLd)} />}
      <article data-testid="event-page" data-state={event.state} className="mx-auto max-w-site px-4 pt-6 sm:px-8 lg:pt-12">
        <Link
          href="/"
          className="inline-flex w-fit items-center gap-2 rounded-sm text-sm text-fg-subtle transition-colors duration-150 hover:text-fg"
        >
          <Back aria-hidden className="size-4" />
          {t("back")}
        </Link>

        <header className="mt-8 lg:mt-12">
          <div className="intro flex flex-wrap items-center gap-2 [--i:0]">
            {past && <Tag>{te("past")}</Tag>}
            {live && <Tag tone="next">{te("happeningNow")}</Tag>}
            {!live && today && <Tag tone="next">{te("today")}</Tag>}
            {event.state === "next" && !today && <Tag tone="next">{te("next")}</Tag>}
            {event.is_tentative && <Tag tone="tentative">{te("tentative")}</Tag>}
          </div>
          <h1
            className={cn(
              "intro mt-4 max-w-[22ch] text-[clamp(2.25rem,8vw,4rem)] leading-[1.05] font-extrabold text-balance [--i:1]",
              past ? "text-fg-muted" : "text-fg",
              l === "en" ? "tracking-[-0.02em]" : "tracking-[-0.01em]",
            )}
          >
            {title}
          </h1>
          {seriesTotal > 1 && event.series_no ? (
            <p className="intro mt-3 text-[0.9375rem] text-fg-subtle [--i:2]">
              {te("seriesPosition", { n: event.series_no, total: seriesTotal })}
            </p>
          ) : null}
        </header>

        <div className={cn(
            "mt-8 grid items-start gap-10 lg:mt-12 lg:gap-16",
            hasBody ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]" : "lg:max-w-[28rem]",
          )}>
          {/* ---------- Ticket: when, where, actions. First in the DOM so it leads on mobile. ---------- */}
          <aside
            aria-label={t("when")}
            data-testid="event-ticket"
            className={cn(
              "relative rounded-lg border p-5 lg:sticky lg:top-8 lg:order-last lg:p-6",
              past
                ? "border-border bg-surface"
                : "border-border-accent bg-bg-raised shadow-[var(--shadow-featured)] [background-image:var(--card-featured-bg)]",
            )}
          >
            {!past && (
              <>
                <span aria-hidden className="absolute -top-px -start-px size-3.5 rounded-ss-lg border-s-2 border-t-2 border-brand-purple" />
                <span aria-hidden className="absolute -top-px -end-px size-3.5 rounded-se-lg border-e-2 border-t-2 border-brand-purple" />
              </>
            )}

            <p className={cn("text-sm font-medium", past ? "text-fg-subtle" : "text-brand-purple-soft")}>{relative}</p>
            <div className="mt-3 flex items-end gap-4">
              <bdi
                dir="ltr"
                className={cn(
                  "font-mono text-5xl leading-none font-medium tabular-nums",
                  past ? "text-fg-muted" : "text-fg",
                )}
              >
                {formatShortDate(event.starts_at, l)}
              </bdi>
              <div className="grid gap-0.5 pb-0.5">
                <span className="text-sm text-fg-muted">{weekday}</span>
                <bdi dir="ltr" className="w-fit font-mono text-sm text-fg-muted">
                  {formatTimeRange(event.starts_at, event.ends_at)}
                </bdi>
              </div>
            </div>
            <p className="sr-only">
              <time dateTime={isoAttr(event.starts_at)}>{formatEventDate(event.starts_at, l)}</time>
            </p>

            <div className="mt-5 flex items-start gap-2.5 border-t border-border pt-5">
              <MapPin aria-hidden className="mt-[0.2em] size-[18px] shrink-0 text-brand-purple-soft" />
              <div className="grid gap-1 text-[0.9375rem]">
                <p className="sr-only">{t("where")}</p>
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-fg">
                  {venue && <span>{venue}</span>}
                  {venueIsTbd(event) && <Tag tone="tbd">{te("venueTbd")}</Tag>}
                </p>
                {address && <p className="text-sm text-fg-subtle">{address}</p>}
                {event.venue?.maps_url && (
                  <a
                    href={event.venue.maps_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex w-fit items-center gap-1 rounded-sm text-sm font-medium text-brand-purple-soft hover:text-brand-purple-softer"
                  >
                    {t("openMaps")}
                    <ArrowUpRight aria-hidden className="size-3.5 rtl:-scale-x-100" />
                    <span className="sr-only"> {te("opensInNewTab")}</span>
                  </a>
                )}
              </div>
            </div>

            {past ? (
              <p className="mt-5 rounded-md border border-border bg-bg-deep/45 px-3.5 py-3 text-sm text-fg-subtle">
                {t("pastNote")}
              </p>
            ) : (
              <EventActions event={event} className="mt-5" />
            )}
          </aside>

          {/* ---------- About + speakers ---------- */}
          {hasBody && (
          <div className="grid min-w-0 gap-10">
            {blurb && (
              <p className="max-w-[60ch] text-[1.0625rem] leading-relaxed text-pretty text-fg-muted lg:text-[1.1875rem]">
                {blurb}
              </p>
            )}
            {speakers.length > 0 && (
              <section aria-labelledby="speakers-heading">
                <h2 id="speakers-heading" className={l === "he" ? "eyebrow-he text-sm" : "eyebrow-pixel text-[0.6875rem]"}>
                  {t("speakers")}
                </h2>
                <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                  {speakers.map((sp) => (
                    <li key={sp.key} className="flex items-center gap-4 rounded-lg border border-border bg-surface p-4">
                      <SpeakerFace speaker={sp} size={64} className={cn(past && "opacity-80")} />
                      <div className="min-w-0 flex-1">
                        <p className="text-lg leading-tight font-semibold text-fg">{sp.name}</p>
                        {sp.role && <p className="mt-1 text-sm text-fg-subtle">{sp.role}</p>}
                      </div>
                      <SpeakerLinkedIn url={sp.linkedinUrl} name={sp.name} />
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
          )}
        </div>

        {/* ---------- Previous / next meetup ---------- */}
        {(prev || next) && (
          <nav aria-label={t("seasonNav")} className="mt-16 grid gap-3 border-t border-border pt-8 sm:grid-cols-2 lg:mt-24">
            {prev ? (
              <Link
                href={`/events/${prev.slug}`}
                className="group grid gap-1 rounded-lg border border-border p-4 transition-colors duration-150 hover:border-border-strong hover:bg-surface"
              >
                <span className="inline-flex items-center gap-1.5 text-sm text-fg-subtle">
                  <Back aria-hidden className="size-4" />
                  {t("prevMeetup")}
                </span>
                <span className="font-semibold text-fg">{loc(prev, "title", l)}</span>
                <bdi dir="ltr" className="w-fit font-mono text-sm text-fg-subtle">
                  {formatShortDate(prev.starts_at, l)}
                </bdi>
              </Link>
            ) : (
              <span className="hidden sm:block" />
            )}
            {next && (
              <Link
                href={`/events/${next.slug}`}
                className="group grid justify-items-end gap-1 rounded-lg border border-border p-4 text-end transition-colors duration-150 hover:border-border-strong hover:bg-surface"
              >
                <span className="inline-flex items-center gap-1.5 text-sm text-fg-subtle">
                  {t("nextMeetup")}
                  <Forward aria-hidden className="size-4" />
                </span>
                <span className="font-semibold text-fg">{loc(next, "title", l)}</span>
                <bdi dir="ltr" className="w-fit font-mono text-sm text-fg-subtle">
                  {formatShortDate(next.starts_at, l)}
                </bdi>
              </Link>
            )}
          </nav>
        )}
      </article>
    </div>
  );
}
