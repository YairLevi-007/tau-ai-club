import { getLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import type { SeasonEvent } from "@/lib/data/types";
import { loc } from "@/lib/event-format";
import { Link } from "@/i18n/navigation";
import { EventActions, EventMeta, EventPills } from "./event-bits";

/**
 * The Next event card. Server-rendered and fully visible in the first HTML:
 * no client JS, no entrance animation, never hidden waiting for an intro.
 */
export async function NextEventCard({ event }: { event: SeasonEvent | null }) {
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations("event");

  return (
    <section
      aria-labelledby="next-event-heading"
      data-testid="next-event-card"
      data-event-slug={event?.slug ?? ""}
      className="rounded-lg border border-border-accent bg-surface p-5 shadow-[var(--highlight-top),var(--glow-featured)] sm:p-7"
    >
      <p id="next-event-heading" className={locale === "he" ? "eyebrow-he" : "eyebrow-pixel"}>
        {event?.state === "live" ? t("happeningNow") : t("nextEvent")}
      </p>

      {event ? (
        <div className="mt-3 grid gap-5">
          <div className="grid gap-2">
            <h2 className="text-h2 font-bold">
              <Link href={`/events/${event.slug}`} className="hover:text-brand-purple-softer">
                {loc(event, "title", locale)}
              </Link>
            </h2>
            <div className="flex flex-wrap gap-2 empty:hidden">
              <EventPills event={event} showState={false} />
            </div>
          </div>
          <EventMeta event={event} />
          {loc(event, "blurb", locale) && <p className="max-w-[68ch] text-fg-muted">{loc(event, "blurb", locale)}</p>}
          <EventActions event={event} />
        </div>
      ) : (
        <div className="mt-3 grid gap-2">
          <h2 className="text-h3 font-semibold">{t("noUpcomingTitle")}</h2>
          <p className="text-fg-subtle">{t("noUpcomingBody")}</p>
        </div>
      )}
    </section>
  );
}
