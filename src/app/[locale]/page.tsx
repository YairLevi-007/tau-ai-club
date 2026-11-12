import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { getSeason } from "@/lib/events";
import { loc } from "@/lib/event-format";
import { NextEventCard } from "@/components/events/next-event-card";
import { SeasonTimeline } from "@/components/events/season-timeline";

// ISR: re-render at most every 5 minutes (see PUBLIC_REVALIDATE_SECONDS in config/site.ts;
// route segment config must be a literal).
export const revalidate = 300;

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const l = locale as Locale;

  const [season, t, te] = await Promise.all([getSeason(), getTranslations("meta"), getTranslations("errors")]);
  const cohort = season.status === "ok" ? season.cohort : null;

  return (
    <div className="relative">
      {/* One glow per viewport, behind the hero. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[480px] [background:var(--glow-hero)]" />

      <div className="relative mx-auto grid max-w-site gap-12 px-4 pt-12 sm:px-6 sm:pt-20">
        <section aria-labelledby="hero-heading" className="grid gap-4">
          {cohort && (
            <p className="eyebrow-pixel">
              <bdi lang="en">{cohort.name_en}</bdi>
            </p>
          )}
          <h1 id="hero-heading" className="max-w-[18ch] text-display font-extrabold text-fg">
            {t("title")}
          </h1>
          {cohort && loc(cohort, "tagline", l) && (
            <p className="max-w-[60ch] text-body-lg text-fg-muted">{loc(cohort, "tagline", l)}</p>
          )}
        </section>

        {season.status === "ok" ? (
          <>
            <NextEventCard event={season.next} />
            <SeasonTimeline events={season.events} />
          </>
        ) : (
          <p role="status" data-testid="data-unavailable" className="rounded-lg border border-border bg-surface p-5">
            {te("dataUnavailable")}
          </p>
        )}
      </div>
    </div>
  );
}
