import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { routing, type Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { getEventBySlug, getEventSlugs } from "@/lib/events";
import { loc } from "@/lib/event-format";
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
  // Public fields only. Never put speaker contact data in metadata.
  const title = loc(event, "title", locale) ?? "";
  const description = loc(event, "blurb", locale) ?? undefined;
  return {
    title,
    description,
    alternates: {
      canonical: locale === routing.defaultLocale ? `/events/${slug}` : `/${locale}/events/${slug}`,
      languages: { he: `/events/${slug}`, en: `/en/events/${slug}` },
    },
    openGraph: { title, description },
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
