import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { routing, type Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { authEnabled } from "@/lib/supabase/config";
import { requireMember } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { signPhotos } from "@/lib/members/photos";
import { NAMES_VISIBLE_TO_ALL_MEMBERS, getInitiative, getInitiativePeople, israelToday } from "@/lib/initiatives";
import { loc } from "@/lib/event-format";
import {
  CategoryTag,
  Headcount,
  JoinControl,
  KindBadge,
  LeadLine,
  StatusTag,
  WhenWhere,
  clubCardClass,
  shortDay,
} from "@/components/initiatives/initiative-bits";
import { hintClass, raisedPanelClass, smallBtn } from "@/components/admin/styles";
import { BidiText } from "@/components/events/bidi-text";
import { MemberAvatar } from "@/components/members/member-avatar";
import { PageBackdrop } from "@/components/site/page-backdrop";
import { cn } from "@/lib/utils";

export async function generateMetadata({ params }: PageProps<"/[locale]/initiatives/[id]">): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  // Members only: a generic title, so nothing about the initiative reaches the metadata.
  const t = await getTranslations({ locale, namespace: "initiatives" });
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

/**
 * One initiative: what, when, where, why it's the club's, and "I'm in". The lead and admins also
 * see who's in, by name (never emails); everyone else sees the count.
 */
export default async function InitiativePage({ params }: PageProps<"/[locale]/initiatives/[id]">) {
  const { locale: lc, id } = await params;
  if (!hasLocale(routing.locales, lc)) notFound();
  const locale = lc as Locale;
  setRequestLocale(locale);
  if (!authEnabled()) notFound();
  const viewer = await requireMember(`/initiatives/${id}`);
  const supabase = await createClient();
  if (!supabase) notFound();
  const initiative = await getInitiative(supabase, id);
  if (!initiative) notFound();

  const t = await getTranslations("initiatives");
  const me = viewer.member.id;
  const isLead = initiative.lead_id === me;
  const seesNames = isLead || viewer.member.role === "admin" || NAMES_VISIBLE_TO_ALL_MEMBERS;
  const people = seesNames && initiative.status === "published" ? await getInitiativePeople(supabase, id) : null;
  const photos = await signPhotos(supabase, [initiative.lead_photo, ...(people ?? []).map((p) => p.photo_url)]);
  const photoOf = (url: string | null) => (url ? (photos.get(url) ?? null) : null);

  const today = israelToday();
  const title = loc(initiative, "title", locale) ?? "";
  const summary = loc(initiative, "summary", locale);
  const reason = initiative.kind === "club" ? loc(initiative, "club_reason", locale) : null;
  const editable = isLead && (initiative.status === "pending" || initiative.status === "returned");
  const Back = locale === "he" ? ChevronRight : ChevronLeft;
  const { joined_count: n, spots } = initiative;

  return (
    <div className="relative isolate">
      <PageBackdrop />
      <div className="mx-auto grid max-w-site gap-8 px-4 pt-10 pb-20 sm:px-8 lg:pt-14">
        <Link href="/initiatives" className="inline-flex w-fit items-center gap-1 rounded-sm text-fg-muted hover:text-fg">
          <Back aria-hidden className="size-4" />
          {t("allInitiatives")}
        </Link>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
          <article className="grid gap-5" data-testid="initiative">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {initiative.status !== "published" && <StatusTag status={initiative.status} />}
              <KindBadge kind={initiative.kind} />
              <CategoryTag category={initiative.category} />
              {initiative.signup_until && (
                <span className="text-fg-subtle">
                  {t.rich("signupUntil", {
                    date: shortDay(initiative.signup_until!, Number(today.slice(0, 4))), ltr: (c) => <bdi dir="ltr" className="font-mono">{c}</bdi>,
                  })}
                </span>
              )}
            </div>
            <h1 className="text-[clamp(2rem,6vw,3.25rem)] leading-[1.08] font-extrabold text-balance text-fg">
              <BidiText text={title} />
            </h1>
            <WhenWhere initiative={initiative} className="text-base" />
            {reason && (
              <p className={cn(raisedPanelClass, "flex gap-3 px-4 py-3 text-fg-muted")} data-testid="club-reason">
                <Sparkles aria-hidden className="mt-1 size-4 shrink-0 text-brand-purple-soft" />
                <span>
                  <span className="font-semibold text-fg">{t("whyClub")}</span> {reason}
                </span>
              </p>
            )}
            {summary && <p className="max-w-[68ch] leading-relaxed whitespace-pre-line text-fg-muted">{summary}</p>}
            {editable && (
              <Link href={`/initiatives/${initiative.id}/edit`} className={cn(smallBtn, "w-fit")}>
                {initiative.status === "returned" ? t("editAndResend") : t("edit")}
              </Link>
            )}
          </article>

          <aside className={cn(raisedPanelClass, "grid gap-5 p-5 sm:p-6", initiative.kind === "club" && clubCardClass)}>
            {initiative.status === "published" && (
              <div className="grid gap-3">
                <Headcount initiative={initiative} today={today} />
                {spots && (
                  <div className="h-1.5 overflow-hidden rounded-full bg-bg-deep" aria-hidden>
                    <div className="h-full rounded-full bg-brand-purple" style={{ width: `${Math.min(100, (n / spots) * 100)}%` }} />
                  </div>
                )}
                <JoinControl initiative={initiative} viewerId={me} today={today} wide />
              </div>
            )}
            <div className={cn(initiative.status === "published" && "border-t border-border pt-5")}>
              <LeadLine initiative={initiative} photoSrc={photoOf(initiative.lead_photo)} />
            </div>
            {people && (
              <div className="grid gap-3 border-t border-border pt-5" data-testid="who-is-in">
                <h2 className="font-bold text-fg">{t("whoIsIn")}</h2>
                <p className={hintClass}>{t("whoIsInHint")}</p>
                {people.length ? (
                  <ul className="grid gap-2">
                    {people.map((p) => (
                      <li key={p.member_id} className="flex items-center gap-3">
                        <MemberAvatar name={p.full_name} src={photoOf(p.photo_url)} size={32} />
                        <span className="text-fg">{p.full_name}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-fg-muted">{t("noneYet")}</p>
                )}
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
