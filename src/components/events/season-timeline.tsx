import { getLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import type { SeasonEvent } from "@/lib/data/types";
import {
  formatEventDate,
  formatShortDate,
  formatTimeRange,
  loc,
  speakerNames,
  venueIsTbd,
  venueLabel,
} from "@/lib/event-format";
import { dayToDate, jlmDay, monthStarts } from "@/lib/season-ruler";
import { RevealOnScroll } from "@/components/motion/reveal-on-scroll";
import { Tag } from "./event-bits";
import { SeasonDial, type DialEvent } from "./season-dial";

const intlLocale: Record<Locale, string> = { he: "he-IL", en: "en-GB" };
/** Days of padding before the first and after the last meetup on the dial. */
const PAD_DAYS = 4;

/**
 * The season, as a rotating dial (see season-dial.tsx). Everything the dial
 * shows is prepared here on the server from the data layer: localized titles,
 * dates in Israel time, and day numbers for positioning.
 */
export async function SeasonTimeline({
  events,
  now,
  cohortName,
}: {
  events: SeasonEvent[];
  now: string;
  cohortName?: string | null;
}) {
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations("season");
  const te = await getTranslations("event");

  const dialEvents: DialEvent[] = events.map((e) => {
    const venue = venueLabel(e, locale);
    const who = [speakerNames(e, locale).join(", "), venue].filter(Boolean).join(" · ") || null;
    return {
      slug: e.slug,
      title: loc(e, "title", locale) ?? e.slug,
      state: e.state,
      tentative: e.is_tentative,
      venueTbd: venueIsTbd(e),
      day: jlmDay(e.starts_at),
      startsAt: new Date(e.starts_at).toISOString(),
      weekday: new Intl.DateTimeFormat(intlLocale[locale], { timeZone: "Asia/Jerusalem", weekday: "long" }).format(
        new Date(e.starts_at),
      ),
      shortDate: formatShortDate(e.starts_at, locale),
      fullDate: formatEventDate(e.starts_at, locale),
      timeRange: formatTimeRange(e.starts_at, e.ends_at),
      who,
    };
  });

  const nowDay = jlmDay(now);
  const startDay = (dialEvents[0]?.day ?? nowDay) - PAD_DAYS;
  const endDay = (dialEvents.at(-1)?.day ?? nowDay) + PAD_DAYS;
  const nextIndex = events.findIndex((e) => e.state === "next" || e.state === "live");

  const weekdayFmt = new Intl.DateTimeFormat(intlLocale[locale], { timeZone: "UTC", weekday: "long" });
  const ddmm = new Intl.DateTimeFormat(intlLocale[locale], { timeZone: "UTC", day: "2-digit", month: "2-digit" });
  const dayLabels = Array.from({ length: endDay - startDay + 1 }, (_, k) => {
    const d = dayToDate(startDay + k);
    return { weekday: weekdayFmt.format(d), shortDate: ddmm.format(d).replace("/", ".") };
  });
  const monthFmt = new Intl.DateTimeFormat(intlLocale[locale], { timeZone: "UTC", month: locale === "he" ? "long" : "short" });
  const months = monthStarts(startDay, endDay)
    .slice(1)
    .map((day) => ({ day, label: monthFmt.format(dayToDate(day)) }));

  return (
    <section
      aria-labelledby="season-heading"
      data-testid="season-timeline"
      className="mx-auto max-w-site px-4 pt-14 sm:px-8 lg:pt-24"
    >
      <RevealOnScroll />
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div>
          <h2 id="season-heading" data-reveal className="text-[clamp(1.75rem,6vw,2.5rem)] leading-[1.1] font-bold">
            {t("title")}
          </h2>
          {cohortName && (
            <p data-reveal className="mt-2 text-[0.9375rem] text-fg-subtle">
              {cohortName}
            </p>
          )}
        </div>
        <div data-reveal className="flex flex-wrap items-center gap-2" aria-label={t("legendLabel")} role="group">
          <Tag>{te("past")}</Tag>
          <Tag tone="next">{te("next")}</Tag>
          <Tag tone="tentative">{te("tentative")}</Tag>
          <Tag tone="tbd">{te("venueTbd")}</Tag>
          <span className="tag border-transparent">
            <span aria-hidden className="h-3 w-0.5 bg-brand-lilac" />
            {t("now")}
          </span>
        </div>
      </div>

      {events.length === 0 ? (
        <p className="mt-6 text-fg-subtle">{t("empty")}</p>
      ) : (
        <div data-reveal className="mt-10">
          <SeasonDial
            key={events[nextIndex]?.slug ?? "season-over"}
            events={dialEvents}
            startDay={startDay}
            endDay={endDay}
            nowDay={nowDay}
            nextIndex={nextIndex}
            dayLabels={dayLabels}
            months={months}
            rtl={locale === "he"}
          />
        </div>
      )}
    </section>
  );
}
