import { getLocale, getTranslations } from "next-intl/server";
import { CalendarPlus, Clock, MapPin, Mic } from "lucide-react";
import type { Locale } from "@/i18n/routing";
import type { SeasonEvent } from "@/lib/data/types";
import {
  formatEventDate,
  formatTimeRange,
  googleCalendarUrl,
  isoAttr,
  speakerNames,
  venueIsTbd,
  venueLabel,
} from "@/lib/event-format";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SITE_URL } from "@/config/site";

export function Pill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "accent" | "warn" | "muted" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        tone === "accent" && "border-transparent bg-brand-purple text-on-purple",
        tone === "warn" && "border-border-accent text-brand-purple-softer",
        tone === "muted" && "border-border text-fg-subtle",
        tone === "neutral" && "border-border text-fg-muted",
      )}
    >
      {children}
    </span>
  );
}

/** Status pills: tentative / venue TBD / past / live. Text, not color alone. */
export async function EventPills({ event, showState = true }: { event: SeasonEvent; showState?: boolean }) {
  const t = await getTranslations("event");
  return (
    <>
      {showState && event.state === "past" && <Pill tone="muted">{t("past")}</Pill>}
      {showState && event.state === "live" && <Pill tone="accent">{t("happeningNow")}</Pill>}
      {event.is_tentative && <Pill tone="warn">{t("tentative")}</Pill>}
    </>
  );
}

/** Date · time · venue · speakers. Dates and times are isolated so they don't reorder in RTL. */
export async function EventMeta({ event, size = "md" }: { event: SeasonEvent; size?: "md" | "sm" }) {
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations("event");
  const tp = await getTranslations("eventPage");
  const venue = venueLabel(event, locale);
  const names = speakerNames(event, locale);
  const icon = size === "md" ? "size-4" : "size-3.5";

  return (
    <dl className={cn("grid gap-1.5", size === "md" ? "text-base" : "text-sm")}>
      <div className="flex items-center gap-2">
        <dt className="sr-only">{tp("when")}</dt>
        <Clock aria-hidden className={cn(icon, "shrink-0 text-fg-subtle")} />
        <dd>
          <time dateTime={isoAttr(event.starts_at)}>{formatEventDate(event.starts_at, locale)}</time>
          <span aria-hidden className="mx-1.5 text-fg-faint">·</span>
          <bdi dir="ltr" className="font-mono">
            {formatTimeRange(event.starts_at, event.ends_at)}
          </bdi>
        </dd>
      </div>
      <div className="flex items-center gap-2">
        <dt className="sr-only">{tp("where")}</dt>
        <MapPin aria-hidden className={cn(icon, "shrink-0 text-fg-subtle")} />
        <dd className={cn(venueIsTbd(event) && "text-fg-subtle")}>
          {venueIsTbd(event) ? (venue ? `${venue} · ${t("venueTbd")}` : t("venueTbd")) : venue}
        </dd>
      </div>
      {names.length > 0 && (
        <div className="flex items-center gap-2">
          <dt className="sr-only">{tp("speakers")}</dt>
          <Mic aria-hidden className={cn(icon, "shrink-0 text-fg-subtle")} />
          <dd>{names.join(", ")}</dd>
        </div>
      )}
    </dl>
  );
}

/** Luma (only when luma_url is set) + Google Calendar. */
export async function EventActions({ event }: { event: SeasonEvent }) {
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations("event");
  const pageUrl = `${SITE_URL}${locale === "he" ? "" : `/${locale}`}/events/${event.slug}`;
  const gcal = googleCalendarUrl(event, locale, { pageUrl, tbdLabel: t("venueTbd") });

  return (
    <div className="flex flex-wrap items-center gap-3">
      {event.luma_url && (
        <a
          href={event.luma_url}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(buttonVariants({ size: "lg" }), "h-11 px-5 text-base")}
        >
          {t("registerLuma")}
          <span className="sr-only"> {t("opensInNewTab")}</span>
        </a>
      )}
      <a
        href={gcal}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11 px-5 text-base")}
      >
        <CalendarPlus aria-hidden />
        {t("addToCalendar")}
        <span className="sr-only"> {t("opensInNewTab")}</span>
      </a>
    </div>
  );
}
