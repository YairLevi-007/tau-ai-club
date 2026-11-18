import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CalendarPlus, Eye, Gamepad2, Pencil } from "lucide-react";
import { Tag } from "@/components/events/event-bits";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requireMember } from "@/lib/auth/viewer";
import { getSeason } from "@/lib/events";
import { formatEventDate, formatTimeRange, isoAttr, loc } from "@/lib/event-format";
import { ICS_PATH, calendarFeedLinks } from "@/lib/ics";
import { panelClass, panelTitle, smallBtn } from "@/components/admin/styles";
import { MembersEyebrow } from "@/components/members/members-eyebrow";
import { SignOutButton } from "@/components/auth/auth-buttons";
import { cn } from "@/lib/utils";

export async function generateMetadata({ params }: PageProps<"/[locale]/me">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "me" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

/**
 * The member's home after logging in ("first tab"): greeting, profile, the members'
 * sections, upcoming meetups with calendar downloads, and a slot for the meeting games.
 * Plain on purpose; the designer styles it later.
 */
export default async function MePage({ params }: PageProps<"/[locale]/me">) {
  const { locale: lc } = await params;
  const locale = lc as Locale;
  setRequestLocale(locale);
  const viewer = await requireMember("/me");
  const [t, tc, te, season] = await Promise.all([
    getTranslations("me"),
    getTranslations("content"),
    getTranslations("event"),
    getSeason(),
  ]);

  const upcoming = season.status === "ok" ? season.events.filter((e) => e.state !== "past") : [];
  const feed = calendarFeedLinks(locale);
  const icsHref = (slug: string) => `/api/calendar/${slug}${locale === "he" ? "" : `?locale=${locale}`}`;

  return (
    <div className="mx-auto grid max-w-site gap-8 px-4 pt-10 pb-20 sm:px-8 lg:pt-14" data-testid="me">
      <header className="grid gap-2">
        <MembersEyebrow />
        <h1 className="text-[clamp(1.875rem,6vw,2.5rem)] leading-[1.1] font-extrabold text-fg" data-testid="me-hello">
          {t("hello", { name: viewer.member.firstName })}
        </h1>
        <p className="max-w-[60ch] text-fg-muted">{t("body")}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Link href="/profile" className={smallBtn}>
            <Pencil aria-hidden />
            {t("editProfile")}
          </Link>
          <Link href={`/members/${viewer.member.id}`} className={smallBtn}>
            <Eye aria-hidden />
            {t("viewProfile")}
          </Link>
          <SignOutButton className="h-10 px-3 text-sm" />
        </div>
      </header>

      {/* First slot: the meeting games, built by someone outside the team. This card is where
          their program plugs in (a link, an embed or our own page) once its design is known. */}
      <section aria-labelledby="game-heading" className={cn(panelClass, "grid gap-3 p-5 sm:p-6")} data-testid="me-game-slot">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="game-heading" className={cn(panelTitle, "flex items-center gap-2")}>
            <Gamepad2 aria-hidden className="size-5 text-brand-purple-soft" />
            {t("gameTitle")}
          </h2>
          <Tag>{t("gameSoon")}</Tag>
        </div>
        <p className="max-w-[60ch] text-fg-muted">{t("gameBody")}</p>
      </section>

      <section aria-labelledby="sections-heading" className={cn(panelClass, "grid gap-3 p-5 sm:p-6")}>
        <h2 id="sections-heading" className={panelTitle}>
          {t("sectionsTitle")}
        </h2>
        <ul className="flex flex-wrap gap-2">
          <li>
            <Link href="/lectures" className={smallBtn}>
              {tc("navLectures")}
            </Link>
          </li>
          <li>
            <Link href="/workshops" className={smallBtn}>
              {tc("navWorkshops")}
            </Link>
          </li>
        </ul>
      </section>

      <section aria-labelledby="upcoming-heading" className={cn(panelClass, "grid gap-4 p-5 sm:p-6")} data-testid="me-upcoming">
        <h2 id="upcoming-heading" className={panelTitle}>
          {t("upcomingTitle")}
        </h2>
        {upcoming.length === 0 ? (
          <p className="text-fg-subtle">{t("upcomingEmpty")}</p>
        ) : (
          <ul className="grid gap-3">
            {upcoming.map((e) => (
              <li key={e.slug} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-bg-deep/45 px-4 py-3">
                <div className="grid gap-0.5">
                  <Link href={`/events/${e.slug}`} className="font-semibold text-fg underline-offset-4 hover:underline">
                    {loc(e, "title", locale) ?? e.slug}
                  </Link>
                  <p className="flex flex-wrap gap-x-2 text-sm text-fg-muted">
                    <time dateTime={isoAttr(e.starts_at)}>{formatEventDate(e.starts_at, locale)}</time>
                    <bdi dir="ltr" className="font-mono">
                      {formatTimeRange(e.starts_at, e.ends_at)}
                    </bdi>
                  </p>
                </div>
                <a href={icsHref(e.slug)} download className={smallBtn} data-testid="me-event-ics">
                  <CalendarPlus aria-hidden />
                  {t("addToCalendar")}
                  <span className="sr-only">: {loc(e, "title", locale) ?? e.slug}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
        <div className="grid gap-2 border-t border-border pt-4">
          <h3 className="font-semibold text-fg">{t("seasonFeedTitle")}</h3>
          <p className="max-w-[60ch] text-sm text-fg-muted">{t("seasonFeedBody")}</p>
          <div className="flex flex-wrap gap-2">
            <a href={ICS_PATH[locale]} download className={smallBtn} data-testid="me-season-ics">
              <CalendarPlus aria-hidden />
              {t("seasonFeedDownload")}
            </a>
            <a href={feed.google} target="_blank" rel="noopener noreferrer" className={smallBtn}>
              {t("seasonFeedGoogle")}
              <span className="sr-only"> {te("opensInNewTab")}</span>
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
