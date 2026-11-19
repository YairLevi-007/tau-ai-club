import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { routing, type Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { getSeason } from "@/lib/events";
import { getPublicSections } from "@/lib/content/data";
import { contentKindOf } from "@/lib/content/sections";
import { markdownToText } from "@/lib/content/markdown";
import { formatEventDate, isoAttr, loc } from "@/lib/event-format";
import { alternatesFor, shareMetadata } from "@/lib/seo";
import { Tag } from "@/components/events/event-bits";
import { ContentIntro, Eyebrow, SpeakerList } from "@/components/content/content-bits";
import { cn } from "@/lib/utils";
import { authEnabled } from "@/lib/supabase/config";
import { requireMember } from "@/lib/auth/viewer";
import { BidiText } from "@/components/events/bidi-text";

export const revalidate = 300;

export async function generateMetadata({ params }: PageProps<"/[locale]/lectures">): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const [t, tm] = await Promise.all([
    getTranslations({ locale, namespace: "content" }),
    getTranslations({ locale, namespace: "meta" }),
  ]);
  // Members area on: lectures are members-only, so not indexed or shared.
  if (authEnabled()) return { title: t("lecturesTitle"), robots: { index: false, follow: false } };
  return {
    title: t("lecturesTitle"),
    description: t("lecturesBody"),
    alternates: alternatesFor(locale, "/lectures"),
    ...shareMetadata({ locale, path: "/lectures", title: `${t("lecturesTitle")} · ${tm("siteName")}`, description: t("lecturesBody"), siteName: tm("siteName"), imageAlt: tm("ogAlt") }),
  };
}

/**
 * The season's lectures, newest first once they've happened. Members only once the members
 * area is on (guests go to log in). While it's off: a public preview with blurbs only.
 */
export default async function LecturesPage({ params }: PageProps<"/[locale]/lectures">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const l = locale as Locale;
  if (authEnabled()) await requireMember("/lectures");
  const [t, te, season, sections] = await Promise.all([getTranslations("content"), getTranslations("event"), getSeason(), getPublicSections()]);

  const lectures = season.status === "ok" ? season.events.filter((e) => contentKindOf(e.kind) === "lecture") : [];
  // Past lectures (with their write-ups) first, most recent on top; then what's coming.
  const past = lectures.filter((e) => e.state === "past").reverse();
  const coming = lectures.filter((e) => e.state !== "past");
  const Forward = l === "he" ? ArrowLeft : ArrowRight;

  const card = (e: (typeof lectures)[number]) => {
    const title = loc(e, "title", l) ?? e.slug;
    const blurb = sections[e.slug]?.blurb;
    const blurbText = blurb ? markdownToText((l === "en" ? blurb.body_en : null) || blurb.body_he) : null;
    return (
      <li key={e.slug}>
        <article
          className={cn(
            "relative grid gap-4 rounded-lg border bg-surface p-5 transition-colors duration-150 hover:border-border-accent sm:p-6",
            e.state === "past" ? "border-border" : "border-border-accent",
          )}
          data-testid="lecture-card"
        >
          <div className="flex flex-wrap items-center gap-2 text-sm text-fg-muted">
            <time dateTime={isoAttr(e.starts_at)}>{formatEventDate(e.starts_at, l)}</time>
            {e.state === "past" ? <Tag>{te("past")}</Tag> : <Tag tone={e.state === "next" || e.state === "live" ? "next" : "neutral"}>{t("upcoming")}</Tag>}
          </div>
          <h3 className="text-xl font-bold text-balance text-fg sm:text-2xl">
            <Link href={`/lectures/${e.slug}`} className="rounded-sm after:absolute after:inset-0 after:rounded-lg">
              <BidiText text={title} />
            </Link>
          </h3>
          <SpeakerList event={e} locale={l} size={44} />
          {blurbText ? (
            <p className="line-clamp-3 max-w-[68ch] text-fg-muted" lang={l === "en" && !blurb?.body_en ? "he" : undefined}>
              {blurbText}
            </p>
          ) : (
            <p className="text-sm text-fg-subtle">{t("summaryComing")}</p>
          )}
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-purple-soft" aria-hidden>
            {t("readLecture")}
            <Forward className="size-4" />
          </span>
        </article>
      </li>
    );
  };

  return (
    <div className="mx-auto grid max-w-site gap-10 px-4 pt-10 pb-20 sm:px-8 lg:pt-14" data-testid="lectures-page">
      <ContentIntro eyebrow={<Eyebrow he="מחזור 02" en="Cohort 02" />} title={t("lecturesTitle")} body={t("lecturesBody")} />
      {lectures.length === 0 && <p className="text-fg-subtle">{t("lecturesEmpty")}</p>}
      {past.length > 0 && (
        <section aria-labelledby="past-lectures" className="grid gap-4">
          <h2 id="past-lectures" className="text-lg font-bold text-fg-muted">
            {t("past")}
          </h2>
          <ul className="grid gap-4 lg:grid-cols-2">{past.map(card)}</ul>
        </section>
      )}
      {coming.length > 0 && (
        <section aria-labelledby="coming-lectures" className="grid gap-4">
          <h2 id="coming-lectures" className="text-lg font-bold text-fg-muted">
            {t("upcoming")}
          </h2>
          <ul className="grid gap-4 lg:grid-cols-2">{coming.map(card)}</ul>
        </section>
      )}
    </div>
  );
}
