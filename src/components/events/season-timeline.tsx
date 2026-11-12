import { getLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import type { SeasonEvent } from "@/lib/data/types";
import { formatShortDate, isoAttr, loc } from "@/lib/event-format";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { EventMeta, EventPills, Pill } from "./event-bits";

/**
 * Vertical season timeline. The rail sits on the inline-start side, so it
 * mirrors automatically between RTL and LTR (logical properties only).
 */
export async function SeasonTimeline({ events }: { events: SeasonEvent[] }) {
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations("season");
  const te = await getTranslations("event");

  return (
    <section aria-labelledby="season-heading" data-testid="season-timeline">
      <h2 id="season-heading" className="text-h2 font-bold">
        {t("title")}
      </h2>

      {events.length === 0 ? (
        <p className="mt-4 text-fg-subtle">{t("empty")}</p>
      ) : (
        <ol className="relative mt-8 grid gap-6 border-s border-border ps-6 sm:ps-8">
          {events.map((event) => {
            const isNext = event.state === "next" || event.state === "live";
            return (
              <li
                key={event.id}
                data-testid="timeline-item"
                data-state={event.state}
                data-tentative={event.is_tentative || undefined}
                aria-current={isNext ? "true" : undefined}
                className={cn("relative", event.state === "past" && "opacity-60")}
              >
                {/* Rail marker */}
                <span
                  aria-hidden
                  className={cn(
                    "absolute -start-[calc(1.5rem+5px)] top-2 size-2.5 rounded-full border sm:-start-[calc(2rem+5px)]",
                    isNext ? "border-brand-purple bg-brand-purple" : "border-border bg-bg",
                  )}
                />
                <article
                  className={cn(
                    "grid gap-2 rounded-lg p-4",
                    isNext ? "border border-border-accent bg-surface" : "border border-transparent",
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <time dateTime={isoAttr(event.starts_at)} className="font-mono text-sm text-brand-purple-soft">
                      <bdi dir="ltr">{formatShortDate(event.starts_at, locale)}</bdi>
                    </time>
                    {isNext && <Pill tone="accent">{event.state === "live" ? te("happeningNow") : te("next")}</Pill>}
                    <EventPills event={event} showState={event.state !== "live"} />
                  </div>
                  <h3 className="text-h3">
                    <Link href={`/events/${event.slug}`} className="hover:text-brand-purple-softer">
                      {loc(event, "title", locale)}
                    </Link>
                  </h3>
                  <EventMeta event={event} size="sm" />
                </article>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
