import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CalendarPlus, ChevronLeft, ChevronRight, Eye, Gamepad2, Mail, Pencil, Phone, Presentation, Wrench } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { TIME_ZONE, type Locale } from "@/i18n/routing";
import { requireMember } from "@/lib/auth/viewer";
import { getSeason } from "@/lib/events";
import { formatTimeRange, isoAttr, loc, venueLabel } from "@/lib/event-format";
import { ICS_PATH, calendarFeedLinks } from "@/lib/ics";
import { createClient } from "@/lib/supabase/server";
import { signPhotos } from "@/lib/members/photos";
import { getMemberProfile, getMyContact } from "@/lib/members/profile";
import { hintClass, panelClass, panelTitle, smallBtn } from "@/components/admin/styles";
import { FlyerChip } from "@/components/events/flyer-bits";
import { MemberAvatar } from "@/components/members/member-avatar";
import { MembersEyebrow } from "@/components/members/members-eyebrow";
import { SignOutButton } from "@/components/auth/auth-buttons";
import { cn } from "@/lib/utils";

export async function generateMetadata({ params }: PageProps<"/[locale]/me">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "me" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

/** "2026-11-18" in Israel time, to tell which meetup is today. */
const israelDay = (d: Date | string) => new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(new Date(d));

/**
 * The member's home after logging in: greeting, the profile card, upcoming meetups with
 * calendar downloads, a slot for the meeting games, and the members' sections.
 * The profile card shows the member's own data only (the same reads as /profile).
 */
export default async function MePage({ params }: PageProps<"/[locale]/me">) {
  const { locale: lc } = await params;
  const locale = lc as Locale;
  setRequestLocale(locale);
  const viewer = await requireMember("/me");
  const [t, tc, te, tp, season, supabase] = await Promise.all([
    getTranslations("me"),
    getTranslations("content"),
    getTranslations("event"),
    getTranslations("profile"),
    getSeason(),
    createClient(),
  ]);
  const [profile, contact] = supabase
    ? await Promise.all([getMemberProfile(supabase, viewer.member.id), getMyContact(supabase)])
    : [null, null];
  const photos = supabase && profile ? await signPhotos(supabase, [profile.photo_url]) : new Map<string, string>();
  const photoSrc = profile?.photo_url ? (photos.get(profile.photo_url) ?? null) : null;
  const name = profile?.full_name ?? viewer.member.fullName;
  const subline = [profile?.year ? tp("yearN", { n: profile.year }) : null, profile?.faculty, profile?.program]
    .filter(Boolean)
    .join(" · ");
  const bio = profile ? (locale === "he" ? profile.bio_he || profile.bio_en : profile.bio_en || profile.bio_he) : null;

  const upcoming = season.status === "ok" ? season.events.filter((e) => e.state !== "past") : [];
  const today = israelDay(season.status === "ok" ? season.now : new Date());
  const feed = calendarFeedLinks(locale);
  const icsHref = (slug: string) => `/api/calendar/${slug}${locale === "he" ? "" : `?locale=${locale}`}`;
  const day = new Intl.DateTimeFormat(locale, { timeZone: TIME_ZONE, day: "numeric" });
  const month = new Intl.DateTimeFormat(locale, { timeZone: TIME_ZONE, month: "short" });
  const weekday = new Intl.DateTimeFormat(locale, { timeZone: TIME_ZONE, weekday: "long" });
  const Forward = locale === "he" ? ChevronLeft : ChevronRight;

  const profileCard = (
    <section aria-labelledby="profile-heading" className={cn(panelClass, "grid gap-5 p-5 shadow-[var(--highlight-top)] sm:p-6")}>
      <h2 id="profile-heading" className="sr-only">
        {t("profileTitle")}
      </h2>
      <div className="flex items-center gap-4">
        <MemberAvatar
          name={name}
          src={photoSrc}
          size={72}
          className="rounded-full ring-2 ring-brand-purple/40 ring-offset-2 ring-offset-surface"
        />
        <div className="min-w-0">
          <p className="text-lg leading-tight font-bold text-fg">{name}</p>
          {subline && <p className="mt-1 text-sm text-fg-subtle">{subline}</p>}
        </div>
      </div>
      {bio && <p className="line-clamp-4 text-[0.9375rem] leading-relaxed text-fg-muted">{bio}</p>}
      {contact && (contact.phone || contact.contact_email) && (
        <ul className="grid gap-2 border-t border-border pt-4 text-[0.875rem]">
          {contact.phone && (
            <ContactRow
              icon={<Phone aria-hidden />}
              label={tp("phone")}
              value={contact.phone}
              visibility={contact.share_phone ? t("visibleToMembers") : t("onlyYou")}
            />
          )}
          {contact.contact_email && (
            <ContactRow
              icon={<Mail aria-hidden />}
              label={tp("contactEmail")}
              value={contact.contact_email}
              visibility={contact.share_email ? t("visibleToMembers") : t("onlyYou")}
            />
          )}
        </ul>
      )}
      {profile && !photoSrc && (
        <p className="rounded-md border border-dashed border-border-strong px-3.5 py-3 text-[0.875rem] text-fg-muted">{t("photoNudge")}</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Link href="/profile" className="btn btn-primary h-10 px-3.5 text-sm">
          <Pencil aria-hidden />
          {t("editProfile")}
        </Link>
        <Link href={`/members/${viewer.member.id}`} className={smallBtn}>
          <Eye aria-hidden />
          {t("viewProfile")}
        </Link>
      </div>
      <SignOutButton className="h-10 w-fit px-3 text-sm" />
    </section>
  );

  return (
    <div className="mx-auto grid max-w-site gap-8 px-4 pt-10 pb-20 sm:px-8 lg:pt-14" data-testid="me">
      <header className="grid gap-2">
        <MembersEyebrow />
        <h1
          className={cn(
            "text-[clamp(2rem,7vw,3rem)] leading-[1.05] font-extrabold text-fg",
            locale === "en" ? "tracking-[-0.02em]" : "tracking-[-0.01em]",
          )}
          data-testid="me-hello"
        >
          {t.rich("hello", {
            name: viewer.member.firstName,
            hl: (chunks) => <span className="text-brand-purple-soft">{chunks}</span>,
          })}
        </h1>
        <p className="max-w-[60ch] text-[1.0625rem] text-fg-muted">{t("body")}</p>
      </header>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-8">
        {/* On phones the profile card comes first; on desktop it sits in the side column. */}
        <div className="lg:sticky lg:top-8 lg:col-start-2 lg:row-start-1">{profileCard}</div>

        <div className="grid gap-5 lg:col-start-1 lg:row-start-1">
          <section aria-labelledby="upcoming-heading" className={cn(panelClass, "grid gap-4 p-5 sm:p-6")} data-testid="me-upcoming">
            <h2 id="upcoming-heading" className={panelTitle}>
              {t("upcomingTitle")}
            </h2>
            {upcoming.length === 0 ? (
              <p className="text-fg-subtle">{t("upcomingEmpty")}</p>
            ) : (
              <ul className="grid gap-2.5">
                {upcoming.map((e) => {
                  const isToday = israelDay(e.starts_at) === today;
                  const title = loc(e, "title", locale) ?? e.slug;
                  const venue = venueLabel(e, locale);
                  const start = new Date(e.starts_at);
                  return (
                    <li
                      key={e.slug}
                      className={cn(
                        "flex flex-wrap items-center gap-x-4 gap-y-3 rounded-md border px-3.5 py-3",
                        isToday ? "border-border-accent bg-brand-purple/[0.08]" : "border-border bg-bg-deep/45",
                      )}
                    >
                      <time
                        dateTime={isoAttr(e.starts_at)}
                        className={cn(
                          "grid w-14 shrink-0 place-items-center rounded-md border py-1.5 leading-none text-fg",
                          isToday ? "border-brand-purple bg-brand-purple" : "border-border bg-surface",
                        )}
                      >
                        <span className="font-mono text-[1.375rem] font-bold">{day.format(start)}</span>
                        <span className={cn("mt-1 text-[0.75rem]", isToday ? "text-fg" : "text-fg-subtle")}>{month.format(start)}</span>
                      </time>
                      <div className="grid min-w-0 flex-1 basis-48 gap-0.5">
                        <p className="flex flex-wrap items-center gap-2">
                          <Link href={`/events/${e.slug}`} className="font-semibold text-fg underline-offset-4 hover:underline">
                            {title}
                          </Link>
                          {isToday && (
                            <span className="rounded-full bg-brand-purple px-2 py-0.5 text-[0.75rem] font-semibold text-fg">{t("today")}</span>
                          )}
                        </p>
                        <p className="flex flex-wrap gap-x-2 text-sm text-fg-muted">
                          <span>{weekday.format(start)}</span>
                          <bdi dir="ltr" className="font-mono">
                            {formatTimeRange(e.starts_at, e.ends_at)}
                          </bdi>
                          {venue && <span className="text-fg-subtle">· {venue}</span>}
                        </p>
                      </div>
                      <a href={icsHref(e.slug)} download className={smallBtn} data-testid="me-event-ics">
                        <CalendarPlus aria-hidden />
                        {t("addToCalendar")}
                        <span className="sr-only">: {title}</span>
                      </a>
                    </li>
                  );
                })}
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
              <p className={hintClass}>{t("icsHint")}</p>
            </div>
          </section>

          {/* The meeting games slot. Another team builds the game, so this only says it's coming;
              their program plugs in here (a link, an embed or our own page) once it's ready. */}
          <section
            aria-labelledby="game-heading"
            className="grid justify-items-start gap-3 rounded-lg border-[1.5px] border-dashed border-border-strong bg-bg-deep p-5 sm:p-6"
            data-testid="me-game-slot"
          >
            <FlyerChip locale={locale}>{t("gameSoon")}</FlyerChip>
            <h2 id="game-heading" className={cn(panelTitle, "flex items-center gap-2")}>
              <Gamepad2 aria-hidden className="size-5 text-brand-purple-soft" />
              {t("gameTitle")}
            </h2>
            <p className="max-w-[60ch] text-fg-muted">{t("gameBody")}</p>
          </section>

          <section aria-labelledby="sections-heading" className="grid gap-3">
            <h2 id="sections-heading" className={panelTitle}>
              {t("sectionsTitle")}
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  ["/lectures", tc("navLectures"), t("lecturesHint"), Presentation],
                  ["/workshops", tc("navWorkshops"), t("workshopsHint"), Wrench],
                ] as const
              ).map(([href, label, hint, Icon]) => (
                <li key={href}>
                  <Link
                    href={href}
                    className={cn(
                      panelClass,
                      "group flex h-full items-center gap-4 p-4 transition-colors duration-150 hover:border-border-accent hover:bg-surface-hover",
                    )}
                  >
                    <span className="grid size-11 shrink-0 place-items-center rounded-md border border-border-accent bg-brand-purple-deeper text-fg [&_svg]:size-5">
                      <Icon aria-hidden />
                    </span>
                    <span className="grid min-w-0 flex-1 gap-0.5">
                      <span className="font-semibold text-fg">{label}</span>
                      <span className="text-sm text-fg-subtle">{hint}</span>
                    </span>
                    <Forward aria-hidden className="size-5 shrink-0 text-fg-subtle transition-colors group-hover:text-brand-purple-soft" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

function ContactRow({ icon, label, value, visibility }: { icon: React.ReactNode; label: string; value: string; visibility: string }) {
  return (
    <li className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
      <span className="text-fg-subtle [&_svg]:size-4">{icon}</span>
      <span className="sr-only">{label}:</span>
      <bdi dir="ltr" className="min-w-0 truncate font-mono text-fg">
        {value}
      </bdi>
      <span className="ms-auto text-[0.75rem] text-fg-subtle">{visibility}</span>
    </li>
  );
}
