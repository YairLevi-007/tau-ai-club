import { getLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { TIME_ZONE } from "@/i18n/routing";
import type { SeasonEvent } from "@/lib/data/types";
import { loc } from "@/lib/event-format";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { EventActions, EventMeta, EventPills } from "./event-bits";

/** Whole calendar days from `nowIso` to the event's start, counted in Israel time. */
function daysUntil(startIso: string, nowIso: string) {
  const day = (iso: string) => {
    const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" })
      .format(new Date(iso))
      .split("-")
      .map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.max(0, Math.round((day(startIso) - day(nowIso)) / 86_400_000));
}

/**
 * The Next event card. Server-rendered and fully visible in the first HTML:
 * no client JS, no entrance animation, never hidden waiting for an intro
 * (design/motion-spec.md §0).
 */
export async function NextEventCard({
  event,
  now,
  seriesTotal,
  className,
}: {
  event: SeasonEvent | null;
  /** Server "now" (ISO) the season was classified against. */
  now: string;
  /** Number of events in this event's series this season (for "session n of total"). */
  seriesTotal?: number;
  className?: string;
}) {
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations("event");
  const live = event?.state === "live";
  const blurb = event ? loc(event, "blurb", locale) : null;

  return (
    <section
      aria-labelledby="next-event-heading"
      data-testid="next-event-card"
      data-event-slug={event?.slug ?? ""}
      className={cn(
        "relative rounded-lg border border-border-accent bg-bg-raised p-5 shadow-[var(--shadow-featured)] [background-image:var(--card-featured-bg)] lg:p-7",
        className,
      )}
    >
      {/* Corner brackets, as on the club's PDF covers. */}
      <span aria-hidden className="absolute -top-px -start-px size-3.5 rounded-ss-lg border-s-2 border-t-2 border-brand-purple" />
      <span aria-hidden className="absolute -top-px -end-px size-3.5 rounded-se-lg border-e-2 border-t-2 border-brand-purple" />

      <div className="flex items-center justify-between gap-3">
        <p id="next-event-heading" className="inline-flex items-center gap-2 text-sm font-semibold text-fg">
          <span aria-hidden className="size-2 bg-brand-purple" />
          {live ? t("happeningNow") : t("nextEvent")}
        </p>
        {event && !live && (
          <p className={cn("text-[0.8125rem] font-medium text-brand-purple-softer", locale === "en" && "font-mono")}>
            {t("relativeDays", { days: daysUntil(event.starts_at, now) })}
          </p>
        )}
      </div>

      {event ? (
        <>
          <h2 className="mt-4 text-[clamp(1.5rem,6vw,1.875rem)] leading-[1.15] font-bold text-balance">
            <Link href={`/events/${event.slug}`} className="rounded-sm transition-colors duration-150 hover:text-brand-purple-softer">
              {loc(event, "title", locale)}
            </Link>
          </h2>
          {event.series_no && seriesTotal && seriesTotal > 1 ? (
            <p className="mt-1.5 text-[0.9375rem] text-fg-subtle">
              {t("seriesPosition", { n: event.series_no, total: seriesTotal })}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2 empty:hidden">
            <EventPills event={event} showState={false} />
          </div>

          <div className="mt-4 border-t border-border pt-4">
            <EventMeta event={event} />
          </div>

          {blurb && (
            <p className="mt-4 max-w-[68ch] rounded-md border border-border bg-bg-deep/45 px-3.5 py-3 text-[0.9375rem] leading-relaxed text-fg-muted">
              {blurb}
            </p>
          )}

          <EventActions event={event} className="mt-5" />
        </>
      ) : (
        <div className="mt-4 grid gap-2">
          <h2 className="text-h3 font-semibold">{t("noUpcomingTitle")}</h2>
          <p className="text-fg-subtle">{t("noUpcomingBody")}</p>
        </div>
      )}
    </section>
  );
}
