import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Presentation, TerminalSquare } from "lucide-react";
import { routing, type Locale } from "@/i18n/routing";
import { getSeason } from "@/lib/events";
import { getPublicSections } from "@/lib/content/data";
import { contentKindOf, hasBody } from "@/lib/content/sections";
import { alternatesFor, shareMetadata } from "@/lib/seo";
import { ContentIntro, Eyebrow, MembersOnlyMark, MembersSoon } from "@/components/content/content-bits";
import { LectureCard, WorkshopCard } from "@/components/content/lesson-cards";
import { PageBackdrop } from "@/components/site/page-backdrop";
import { authEnabled } from "@/lib/supabase/config";
import { requireMember } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";

export const revalidate = 300;

export async function generateMetadata({ params }: PageProps<"/[locale]/learn">): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const [t, tm] = await Promise.all([getTranslations({ locale, namespace: "content" }), getTranslations({ locale, namespace: "meta" })]);
  // Members area on: members only, so not indexed or shared.
  if (authEnabled()) return { title: t("lessonsTitle"), robots: { index: false, follow: false } };
  return {
    title: t("lessonsTitle"),
    description: t("lessonsBody"),
    alternates: alternatesFor(locale, "/learn"),
    ...shareMetadata({ locale, path: "/learn", title: `${t("lessonsTitle")} · ${tm("siteName")}`, description: t("lessonsBody"), siteName: tm("siteName"), imageAlt: tm("ogAlt") }),
  };
}

/**
 * "שיעורים / Lessons" (DECISIONS 24.11): lectures on one side, the Claude Code workshops on the
 * other; side by side on wide screens, stacked on phones (lectures first). The cards are the
 * ones the old /lectures and /workshops lists had; those URLs now land here.
 * Members only once the members area is on. While it's off: a public (cached) preview.
 */
export default async function LessonsPage({ params }: PageProps<"/[locale]/learn">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const l = locale as Locale;
  const authOn = authEnabled();
  if (authOn) await requireMember("/learn");
  const [t, te, season, sections] = await Promise.all([getTranslations("content"), getTranslations("event"), getSeason(), getPublicSections()]);

  const events = season.status === "ok" ? season.events : [];
  const lectureList = events.filter((e) => contentKindOf(e.kind) === "lecture");
  // Lectures: past ones (with their write-ups) first, most recent on top; then what's coming.
  const lectures = [...lectureList.filter((e) => e.state === "past").reverse(), ...lectureList.filter((e) => e.state !== "past")];
  const workshops = events.filter((e) => e.kind === "workshop");

  // "Prep list ready" on a workshop card: members only, so only read with the members area on
  // (reading cookies would make the public preview dynamic).
  const prepReady = new Set<string>();
  const supabase = authOn && workshops.length ? await createClient() : null;
  if (supabase) {
    const { data } = await supabase
      .from("event_content")
      .select("body_he, body_en, event:events!inner(slug)")
      .eq("section", "prep")
      .eq("status", "published")
      .in("event_id", workshops.map((w) => w.id));
    for (const row of (data ?? []) as unknown as { body_he: string; body_en: string | null; event: { slug: string } }[]) {
      if (hasBody(row)) prepReady.add(row.event.slug);
    }
  }

  const tags = { past: te("past"), upcoming: t("upcoming"), next: te("next"), happeningNow: te("happeningNow") };
  const columnTitle = "flex items-center gap-2 text-xl font-bold text-fg sm:text-2xl";

  return (
    // The personal area's look (user, 19.11): its backdrop and purple raised cards.
    <div className="relative isolate">
      <PageBackdrop />
      <div className="mx-auto grid max-w-site gap-10 px-4 pt-10 pb-20 sm:px-8 lg:pt-14" data-testid="lessons-page">
        <ContentIntro eyebrow={<Eyebrow he="מחזור 02" en="Cohort 02" />} title={t("lessonsTitle")} body={t("lessonsBody")} />
        <div className="grid items-start gap-12 lg:grid-cols-2 lg:gap-8">
          <section id="lectures" aria-labelledby="lessons-lectures" className="grid scroll-mt-24 gap-4" data-testid="lessons-lectures">
            <h2 id="lessons-lectures" className={columnTitle}>
              <Presentation aria-hidden className="size-5 shrink-0 text-brand-purple-soft" />
              {t("lessonsLectures")}
            </h2>
            {lectures.length === 0 ? (
              <p className="text-fg-subtle">{t("lecturesEmpty")}</p>
            ) : (
              <ul className="grid gap-4">
                {lectures.map((e) => (
                  <li key={e.slug}>
                    <LectureCard
                      event={e}
                      locale={l}
                      blurb={sections[e.slug]?.blurb}
                      labels={{ ...tags, summaryComing: t("summaryComing"), readLecture: t("readLecture") }}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section id="workshops" aria-labelledby="lessons-workshops" className="grid scroll-mt-24 gap-4" data-testid="lessons-workshops">
            <h2 id="lessons-workshops" className={columnTitle}>
              <TerminalSquare aria-hidden className="size-5 shrink-0 text-brand-purple-soft" />
              {t("lessonsWorkshops")}
            </h2>
            {workshops.length === 0 ? (
              <p className="text-fg-subtle">{t("workshopsEmpty")}</p>
            ) : (
              <ol className="grid gap-4">
                {workshops.map((w, i) => (
                  <li key={w.slug}>
                    <WorkshopCard
                      event={w}
                      locale={l}
                      numberLabel={t("workshopNo", { n: w.series_no ?? i + 1, total: workshops.length })}
                      prepReady={prepReady.has(w.slug)}
                      labels={{ ...tags, prepReady: t("prepReady"), open: t("openWorkshop") }}
                    />
                  </li>
                ))}
              </ol>
            )}
            {!authOn && <MembersSoon title={t("soonTitle")} body={t("soonBodyWorkshop")} />}
            <MembersOnlyMark label={t("membersOnlyBadge")} />
          </section>
        </div>
      </div>
    </div>
  );
}
