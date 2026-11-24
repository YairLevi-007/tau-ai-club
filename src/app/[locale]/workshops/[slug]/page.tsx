import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft, ArrowRight, CalendarDays, Clock } from "lucide-react";
import type { Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { raisedPanelClass } from "@/components/admin/styles";
import { FileLink } from "@/components/content/file-link";
import { PageBackdrop } from "@/components/site/page-backdrop";
import { cn } from "@/lib/utils";
import { requireMember } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { getEventBySlug, getSeason } from "@/lib/events";
import { getEventContent } from "@/lib/content/data";
import { TEXT_SECTIONS_ENABLED, WORKSHOP_SECTIONS, bodyFor, hasBody } from "@/lib/content/sections";
import { formatEventDate, formatTimeRange, isoAttr, loc } from "@/lib/event-format";
import { Tag } from "@/components/events/event-bits";
import { AdminEditBar, MembersSoon, SpeakerList } from "@/components/content/content-bits";
import { contentEditPath } from "@/lib/content/admin-edit";
import { authEnabled } from "@/lib/supabase/config";
import { SectionBlock } from "@/components/content/section-block";
import { MembersEyebrow } from "@/components/members/members-eyebrow";
import { BidiText } from "@/components/events/bidi-text";

export async function generateMetadata({ params }: PageProps<"/[locale]/workshops/[slug]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "content" });
  return { title: t("workshopsTitle"), robots: { index: false, follow: false } };
}

/**
 * One workshop: prep checklist, summary, key commands, exercises, resources. Members only.
 * While the members area is off: the public header and a "members only, coming soon" note.
 */
export default async function WorkshopPage({ params }: PageProps<"/[locale]/workshops/[slug]">) {
  const { locale: lc, slug } = await params;
  const l = lc as Locale;
  setRequestLocale(l);
  const authOn = authEnabled();
  const viewer = authOn ? await requireMember(`/workshops/${slug}`) : null;

  const event = await getEventBySlug(slug);
  if (!event || event.kind !== "workshop") notFound();
  const [t, te, season, supabase] = await Promise.all([getTranslations("content"), getTranslations("event"), getSeason(), createClient()]);
  const content = supabase ? await getEventContent(supabase, slug) : null;
  const total = season.status === "ok" ? season.events.filter((e) => e.kind === "workshop").length : 0;
  const Back = l === "he" ? ArrowRight : ArrowLeft;
  const hebrewOnly = { label: t("hebrewOnly"), hint: t("hebrewOnlyHint") };
  const rows = WORKSHOP_SECTIONS.map((section) => ({ section, row: content?.sections.find((s) => s.section === section) }));
  const filled = rows.filter((r): r is { section: (typeof WORKSHOP_SECTIONS)[number]; row: NonNullable<typeof r.row> } => !!r.row && hasBody(r.row));
  const editHref = contentEditPath(viewer, event.id);
  const empty = rows.filter((r) => !r.row || !hasBody(r.row)).map((r) => r.section);

  return (
    <div className="relative isolate">
      <PageBackdrop />
      <article className="mx-auto grid max-w-4xl gap-10 px-4 pt-6 pb-20 sm:px-8 lg:pt-12" data-testid="workshop-page">
        <Link
          href="/learn#workshops"
          className="inline-flex min-h-11 w-fit items-center gap-2 rounded-sm text-sm text-fg-subtle transition-colors duration-150 hover:text-fg"
        >
          <Back aria-hidden className="size-4" />
          {t("backToLessons")}
        </Link>

        <header className="grid gap-5">
          <div className="flex flex-wrap items-center gap-3">
            <MembersEyebrow />
            {event.series_no && total > 0 && <span className="text-sm text-fg-muted">{t("workshopNo", { n: event.series_no, total })}</span>}
            {event.state === "past" && <Tag>{te("past")}</Tag>}
          </div>
          <h1 className="text-[clamp(2rem,6.5vw,3.25rem)] leading-[1.08] font-extrabold text-balance text-fg"><BidiText text={loc(event, "title", l) ?? slug} /></h1>
          {/* Speaker, date and time together in the personal area's raised panel (review 19.11, item 13). */}
          <div className={cn(raisedPanelClass, "grid gap-4 p-5 shadow-[var(--highlight-top)] sm:p-6")}>
            <SpeakerList event={event} locale={l} size={64} />
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-4 text-fg-muted">
              <CalendarDays aria-hidden className="size-4 shrink-0 text-brand-purple-soft" />
              <time dateTime={isoAttr(event.starts_at)}>{formatEventDate(event.starts_at, l)}</time>
              <bdi dir="ltr" className="font-mono text-sm">
                {formatTimeRange(event.starts_at, event.ends_at)}
              </bdi>
              <Link href={`/events/${slug}`} className="inline-flex min-h-11 items-center text-sm text-brand-purple-soft underline underline-offset-4 hover:text-fg">
                {te("details")}
              </Link>
            </p>
          </div>
        </header>

        {editHref && <AdminEditBar href={editHref} note={t("adminEditNote")} label={t("editOnPage")} />}

        {!authOn && <MembersSoon title={t("soonTitle")} body={t("soonBodyWorkshop")} />}

        {/* Sections with content first, in order. The ones still empty share one panel with a single
            note, instead of a row of headings that each say "goes up after the workshop" (review 19.11,
            item 11). Each keeps its own section and test id. */}
        {authOn && filled.map(({ section, row }) => (
          <SectionBlock key={section} section={section} title={t(`section_${section}`)} body={bodyFor(row, l)} hebrewOnly={hebrewOnly} />
        ))}
        {/* Content is files only (DECISIONS 24.11): empty sections are left out, so no permanent
            "coming soon" rows. One quiet line while the workshop has nothing yet. */}
        {authOn && !TEXT_SECTIONS_ENABLED && filled.length === 0 && !content?.files.length && (
          <p className="inline-flex items-start gap-2 text-fg-muted" data-testid="files-coming">
            <Clock aria-hidden className="mt-1 size-4 shrink-0 text-brand-purple-soft" />
            {t("filesComingWorkshop")}
          </p>
        )}
        {authOn && TEXT_SECTIONS_ENABLED && empty.length > 0 && (
          <div className={cn(raisedPanelClass, "grid gap-4 p-5 shadow-[var(--highlight-top)] sm:p-6")} data-testid="coming-later">
            <p className="inline-flex items-start gap-2 text-fg-muted">
              <Clock aria-hidden className="mt-1 size-4 shrink-0 text-brand-purple-soft" />
              {t("comingSoon")}
            </p>
            <ul className="grid divide-y divide-border border-t border-border">
              {empty.map((section) => (
                <li key={section}>
                  <section aria-labelledby={`section-${section}`} data-testid={`section-${section}`} className="flex min-h-12 items-center justify-between gap-3 py-2">
                    <h2 id={`section-${section}`} className="font-semibold text-fg">
                      {t(`section_${section}`)}
                    </h2>
                    <span className="rounded-full border border-border px-2.5 py-0.5 text-xs text-fg-subtle" data-testid="coming-soon">
                      {t("upcoming")}
                    </span>
                  </section>
                </li>
              ))}
            </ul>
          </div>
        )}

        {content && content.files.length > 0 && (
          <SectionBlock section="files" title={t("files")} hebrewOnly={hebrewOnly}>
            <ul className="mt-4 grid gap-2">
              {content.files.map((f) => (
                <li key={f.id}>
                  <FileLink
                    file={f}
                    labels={{ download: t("download", { title: l === "en" ? f.title_en : f.title_he }), openLesson: t("openLesson", { title: l === "en" ? f.title_en : f.title_he }) }}
                  />
                </li>
              ))}
            </ul>
          </SectionBlock>
        )}
      </article>
    </div>
  );
}
