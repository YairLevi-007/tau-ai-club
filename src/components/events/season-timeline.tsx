import { Fragment } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { TIME_ZONE } from "@/i18n/routing";
import type { SeasonEvent } from "@/lib/data/types";
import { formatShortDate, isoAttr, loc, speakerNames, venueIsTbd, venueLabel } from "@/lib/event-format";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { RevealOnScroll } from "@/components/motion/reveal-on-scroll";
import { Tag } from "./event-bits";

const intlLocale: Record<Locale, string> = { he: "he-IL", en: "en-GB" };

function monthKey(iso: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit" }).format(new Date(iso));
}
function monthLabel(iso: string, locale: Locale) {
  return new Intl.DateTimeFormat(intlLocale[locale], { timeZone: TIME_ZONE, month: locale === "he" ? "long" : "short" }).format(
    new Date(iso),
  );
}
function weekdayShort(iso: string, locale: Locale) {
  return new Intl.DateTimeFormat(intlLocale[locale], { timeZone: TIME_ZONE, weekday: "short" }).format(new Date(iso));
}

/**
 * Vertical season timeline. The rail is the list's inline-start border, so it
 * mirrors between RTL and LTR. Square "pixel" nodes echo the logo:
 * past = filled deep purple, next/live = filled purple, upcoming = hollow,
 * tentative = dashed. Every state is also written as a text tag.
 */
export async function SeasonTimeline({ events, cohortName }: { events: SeasonEvent[]; cohortName?: string | null }) {
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations("season");
  const te = await getTranslations("event");

  return (
    <section
      aria-labelledby="season-heading"
      data-testid="season-timeline"
      className="mx-auto max-w-site px-4 pt-14 sm:px-8 lg:grid lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] lg:items-start lg:gap-16 lg:pt-24"
    >
      <RevealOnScroll />
      <div className="lg:sticky lg:top-8">
        <h2 id="season-heading" data-reveal className="text-[clamp(1.75rem,6vw,2.5rem)] leading-[1.1] font-bold">
          {t("title")}
        </h2>
        {cohortName && (
          <p data-reveal className="mt-2 text-[0.9375rem] text-fg-subtle">
            {cohortName}
          </p>
        )}
        <p className="sr-only">{t("legendLabel")}</p>
        <div data-reveal className="mt-4 flex flex-wrap gap-2">
          <Tag>{te("past")}</Tag>
          <Tag tone="next">{te("next")}</Tag>
          <Tag tone="tentative">{te("tentative")}</Tag>
          <Tag tone="tbd">{te("venueTbd")}</Tag>
        </div>
      </div>

      {events.length === 0 ? (
        <p className="mt-6 text-fg-subtle lg:mt-0">{t("empty")}</p>
      ) : (
        <ol className="relative mt-8 max-w-[40rem] border-s-2 border-border lg:mt-0">
          {events.map((event, i) => {
            const isNext = event.state === "next" || event.state === "live";
            const past = event.state === "past";
            const newMonth = i === 0 || monthKey(event.starts_at) !== monthKey(events[i - 1].starts_at);
            const venue = venueLabel(event, locale);
            const who = [...speakerNames(event, locale), venue].filter(Boolean) as string[];

            return (
              <Fragment key={event.id}>
                {newMonth && (
                  <li
                    aria-hidden
                    data-reveal
                    className={cn(
                      "flex items-center gap-3 ps-5 pb-2",
                      i > 0 && "pt-6",
                      locale === "he"
                        ? "text-[0.8125rem] font-medium text-fg-subtle"
                        : "font-pixel text-[0.6875rem] tracking-[0.22em] text-fg-subtle uppercase",
                    )}
                  >
                    {monthLabel(event.starts_at, locale)}
                    <span className="h-px flex-1 bg-border" />
                  </li>
                )}
                <li
                  data-testid="timeline-item"
                  data-state={event.state}
                  data-tentative={event.is_tentative || undefined}
                  aria-current={isNext ? "true" : undefined}
                  data-reveal
                  className="group relative grid grid-cols-[3.25rem_minmax(0,1fr)] gap-x-3 ps-5 lg:grid-cols-[4.5rem_minmax(0,1fr)] lg:gap-x-5 lg:ps-7"
                >
                  {/* Rail node */}
                  <span
                    aria-hidden
                    className={cn(
                      "absolute top-[1.125rem] border-2",
                      isNext
                        ? "-start-[9px] size-4 border-brand-lilac bg-brand-purple"
                        : "-start-[7px] size-3 bg-bg",
                      past && "border-brand-purple-deeper bg-brand-purple-deeper",
                      !isNext && !past && (event.is_tentative ? "border-dashed border-brand-purple-soft" : "border-fg-faint"),
                    )}
                  />

                  <time
                    dateTime={isoAttr(event.starts_at)}
                    className="flex flex-col pt-3 font-mono leading-tight"
                  >
                    <span className="font-sans text-xs text-fg-subtle">{weekdayShort(event.starts_at, locale)}</span>
                    <bdi dir="ltr" className={cn("text-base font-medium lg:text-lg", past ? "text-fg-subtle" : "text-fg")}>
                      {formatShortDate(event.starts_at, locale)}
                    </bdi>
                  </time>

                  <article
                    className={cn(
                      "min-w-0 rounded-md",
                      isNext ? "my-1.5 border border-border-accent bg-surface px-3.5 pt-2.5 pb-3.5" : "pt-2.5 pb-4",
                    )}
                  >
                    <h3 className={cn("text-[1.0625rem] leading-snug font-semibold text-balance", past ? "text-fg-muted" : "text-fg")}>
                      <Link
                        href={`/events/${event.slug}`}
                        className="rounded-sm transition-colors duration-150 after:absolute after:inset-0 group-hover:text-brand-purple-softer"
                      >
                        {loc(event, "title", locale)}
                      </Link>
                    </h3>
                    {who.length > 0 && (
                      <p className={cn("mt-0.5 text-[0.9375rem] leading-normal", past ? "text-fg-subtle" : "text-fg-muted")}>
                        {who.map((w, k) => (
                          <Fragment key={k}>
                            {k > 0 && (
                              <span aria-hidden className="mx-1.5 text-fg-faint">
                                ·
                              </span>
                            )}
                            {w}
                          </Fragment>
                        ))}
                      </p>
                    )}
                    {(past || isNext || event.is_tentative || venueIsTbd(event)) && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {past && <Tag>{te("past")}</Tag>}
                        {isNext && <Tag tone="next">{event.state === "live" ? te("happeningNow") : te("next")}</Tag>}
                        {event.is_tentative && <Tag tone="tentative">{te("tentative")}</Tag>}
                        {venueIsTbd(event) && <Tag tone="tbd">{te("venueTbd")}</Tag>}
                      </div>
                    )}
                  </article>
                </li>
              </Fragment>
            );
          })}
        </ol>
      )}
    </section>
  );
}
