import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { routing, type Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { getEventBySlug, getEventSlugs } from "@/lib/events";
import { formatEventDate, formatTimeRange, loc, speakerNames, venueLabel } from "@/lib/event-format";
import { alternatesFor, shareMetadata } from "@/lib/seo";
import { EventActions, EventMeta, EventPills } from "@/components/events/event-bits";

export const revalidate = 300;

export async function generateStaticParams() {
  const slugs = await getEventSlugs();
  return routing.locales.flatMap((locale) => slugs.map((slug) => ({ locale, slug })));
}

export async function generateMetadata({ params }: PageProps<"/[locale]/events/[slug]">): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const event = await getEventBySlug(slug);
  if (!event) return {};
  // Public fields only (title, date, venue, speaker names, blurb). Never speaker contact data.
  const [t, te] = await Promise.all([
    getTranslations({ locale, namespace: "meta" }),
    getTranslations({ locale, namespace: "event" }),
  ]);
  const title = loc(event, "title", locale) ?? "";
  const when = `${formatEventDate(event.starts_at, locale)} · ${formatTimeRange(event.starts_at, event.ends_at)}`;
  const where = venueLabel(event, locale) ?? te("venueTbd");
  const who = speakerNames(event, locale).join(", ");
  const description = [when, where, who, loc(event, "blurb", locale)].filter(Boolean).join(" · ");
  const path = `/events/${slug}`;
  return {
    title,
    description,
    alternates: alternatesFor(locale, path),
    ...shareMetadata({
      locale,
      path,
      title: `${title} · ${t("siteName")}`,
      description,
      siteName: t("siteName"),
      imageAlt: t("ogAlt"),
      type: "article",
    }),
  };
}

export default async function EventPage({ params }: PageProps<"/[locale]/events/[slug]">) {
  const { locale, slug } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const l = locale as Locale;

  const event = await getEventBySlug(slug);
  if (!event) notFound();
  const t = await getTranslations("eventPage");
  const Back = l === "he" ? ArrowRight : ArrowLeft; // points toward inline-start

  return (
    <article className="mx-auto grid max-w-site gap-6 px-4 pt-10 sm:px-6 sm:pt-16">
      <Link href="/" className="inline-flex w-fit items-center gap-2 text-sm text-fg-subtle hover:text-fg">
        <Back aria-hidden className="size-4" />
        {t("back")}
      </Link>
      <header className="grid gap-3">
        <div className="flex flex-wrap gap-2 empty:hidden">
          <EventPills event={event} />
        </div>
        <h1 className="max-w-[24ch] text-h1 font-bold">{loc(event, "title", l)}</h1>
      </header>
      <EventMeta event={event} />
      {loc(event, "blurb", l) && <p className="max-w-[68ch] text-body-lg">{loc(event, "blurb", l)}</p>}
      {event.state !== "past" && <EventActions event={event} />}
    </article>
  );
}
