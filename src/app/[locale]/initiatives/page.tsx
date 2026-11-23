import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { routing, TIME_ZONE, type Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { authEnabled } from "@/lib/supabase/config";
import { requireMember } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { signPhotos } from "@/lib/members/photos";
import { getInitiatives, israelToday, type Initiative } from "@/lib/initiatives";
import { loc } from "@/lib/event-format";
import { InitiativeCard, KindBadge, StatusTag, WhenWhere } from "@/components/initiatives/initiative-bits";
import { ActionForm } from "@/components/admin/action-form";
import { dangerBtn, raisedPanelClass, smallBtn } from "@/components/admin/styles";
import { BidiText } from "@/components/events/bidi-text";
import { MembersEyebrow } from "@/components/members/members-eyebrow";
import { PageBackdrop } from "@/components/site/page-backdrop";
import { cn } from "@/lib/utils";
import { withdrawInitiative } from "./actions";

const FILTERS = ["all", "club", "member", "mine"] as const;
type Filter = (typeof FILTERS)[number];

export async function generateMetadata({ params }: PageProps<"/[locale]/initiatives">): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: "initiatives" });
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

/**
 * Initiatives (יוזמות), members only: what the club is asking for, members' initiatives an admin
 * approved, and under "Mine" the member's own proposals with where each one stands, plus what
 * they've joined. Dynamic (it reads the session); RLS decides what comes back.
 */
export default async function InitiativesPage({ params, searchParams }: PageProps<"/[locale]/initiatives">) {
  const { locale: lc } = await params;
  if (!hasLocale(routing.locales, lc)) notFound();
  const locale = lc as Locale;
  setRequestLocale(locale);
  // Initiatives live in the members area; with it off there's nothing to show.
  if (!authEnabled()) notFound();
  const viewer = await requireMember("/initiatives");
  const sp = await searchParams;
  const filter: Filter = FILTERS.includes(sp.filter as Filter) ? (sp.filter as Filter) : "all";
  const sent = sp.sent === "1";

  const [t, supabase] = await Promise.all([getTranslations("initiatives"), createClient()]);
  const all = supabase ? await getInitiatives(supabase) : null;
  const today = israelToday();
  const me = viewer.member.id;

  const published = (all ?? []).filter((i) => i.status === "published");
  const club = published.filter((i) => i.kind === "club");
  const members = published.filter((i) => i.kind === "member");
  const mine = (all ?? []).filter((i) => i.lead_id === me);
  const joined = published.filter((i) => i.i_joined);

  const shown = filter === "mine" ? [...mine, ...joined] : filter === "club" ? club : filter === "member" ? members : published;
  const photos = supabase ? await signPhotos(supabase, shown.map((i) => i.lead_photo)) : new Map<string, string>();
  const photoOf = (i: Initiative) => (i.lead_photo ? (photos.get(i.lead_photo) ?? null) : null);

  const filterLabel: Record<Filter, string> = { all: t("filterAll"), club: t("filterClub"), member: t("filterMember"), mine: t("filterMine") };
  const listClass = "grid gap-4 md:grid-cols-2";
  const cards = (list: Initiative[]) => (
    <ul className={listClass}>
      {list.map((i) => (
        <li key={i.id}>
          <InitiativeCard initiative={i} locale={locale} viewerId={me} today={today} photoSrc={photoOf(i)} />
        </li>
      ))}
    </ul>
  );
  const section = (id: string, title: React.ReactNode, list: Initiative[], empty: string) => (
    <section aria-labelledby={id} className="grid gap-4">
      <h2 id={id} className="flex flex-wrap items-center gap-3 text-lg font-bold text-fg">
        {title}
      </h2>
      {list.length ? cards(list) : <p className="text-fg-muted">{empty}</p>}
    </section>
  );

  return (
    <div className="relative isolate">
      <PageBackdrop />
      <div className="mx-auto grid max-w-site gap-10 px-4 pt-10 pb-20 sm:px-8 lg:pt-14">
        <header className="grid gap-5 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="grid gap-3">
            <MembersEyebrow />
            <h1 className="text-[clamp(2rem,7vw,3rem)] leading-[1.05] font-extrabold text-fg">{t("title")}</h1>
            <p className="max-w-[68ch] text-fg-muted">{t("intro")}</p>
          </div>
          <Link href="/initiatives/new" className="btn btn-primary h-11 w-full px-5 sm:w-fit" data-testid="propose">
            <Plus aria-hidden className="size-4" />
            {t("propose")}
          </Link>
        </header>

        <nav aria-label={t("filtersLabel")}>
          <ul className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <li key={f}>
                <Link
                  href={f === "all" ? "/initiatives" : { pathname: "/initiatives", query: { filter: f } }}
                  aria-current={f === filter ? "page" : undefined}
                  className={cn("btn h-10 rounded-full px-4 text-sm", f === filter ? "btn-primary" : "btn-ghost")}
                  data-testid={`filter-${f}`}
                >
                  {filterLabel[f]}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {sent && (
          <p role="status" className={cn(raisedPanelClass, "flex items-center gap-2 px-4 py-3 text-fg")} data-testid="sent-note">
            <Check aria-hidden className="size-4 shrink-0 text-brand-purple-soft" />
            {t("sent")}
          </p>
        )}

        {all === null ? (
          <p role="alert" className="text-fg-muted">
            {t("loadError")}
          </p>
        ) : filter === "mine" ? (
          <>
            <section aria-labelledby="my-proposals" className="grid gap-4">
              <h2 id="my-proposals" className="text-lg font-bold text-fg">
                {t("sectionMyProposals")}
              </h2>
              {mine.length ? (
                <ul className={listClass}>
                  {mine.map((i) => (
                    <li key={i.id}>
                      <MyProposal initiative={i} locale={locale} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-fg-muted">{t("emptyMine")}</p>
              )}
            </section>
            {section("joined", t("sectionJoined"), joined, t("emptyJoined"))}
          </>
        ) : (
          <>
            {filter !== "member" &&
              section(
                "club",
                <>
                  <KindBadge kind="club" />
                  {t("sectionClub")}
                </>,
                club,
                t("emptyClub"),
              )}
            {filter !== "club" && section("members", t("sectionMember"), members, t("emptyMember"))}
          </>
        )}
      </div>
    </div>
  );
}

/** One of my proposals under "Mine": where it stands, the admin's note, and what I can do now. */
async function MyProposal({ initiative: i, locale }: { initiative: Initiative; locale: Locale }) {
  const t = await getTranslations("initiatives");
  const title = loc(i, "title", locale) ?? "";
  const summary = loc(i, "summary", locale);
  const editable = i.status === "pending" || i.status === "returned";
  const sentAt = new Intl.DateTimeFormat(locale, { timeZone: TIME_ZONE, day: "numeric", month: "numeric" }).format(new Date(i.submitted_at));
  const Forward = locale === "he" ? ChevronLeft : ChevronRight;
  return (
    <article
      className={cn(raisedPanelClass, "flex h-full flex-col gap-3 p-5 sm:p-6", i.status === "pending" && "border-dashed")}
      data-testid="my-proposal"
      data-status={i.status}
    >
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <StatusTag status={i.status} />
        {i.status === "published" && <KindBadge kind={i.kind} />}
        <span className="text-fg-subtle">{t.rich("sentAt", { date: sentAt, ltr: (c) => <bdi dir="ltr">{c}</bdi> })}</span>
      </div>
      <h3 className="text-xl leading-snug font-bold text-balance text-fg">
        {i.status === "published" ? (
          <Link href={`/initiatives/${i.id}`} className="rounded-sm hover:text-brand-purple-softer">
            <BidiText text={title} />
          </Link>
        ) : (
          <BidiText text={title} />
        )}
      </h3>
      {summary && <p className="line-clamp-3 max-w-[68ch] text-fg-muted">{summary}</p>}
      <WhenWhere initiative={i} />
      {editable && i.proposed_kind === "club" && <p className="text-sm text-brand-purple-soft">{t("askedClub")}</p>}
      {i.review_note && (i.status === "returned" || i.status === "rejected") && (
        <p className="rounded-md border-s-2 border-brand-purple bg-bg-deep/60 px-4 py-3 text-fg-muted" data-testid="admin-note">
          <span className="font-semibold text-fg">{t("adminNote")}</span> {i.review_note}
        </p>
      )}
      {i.status === "pending" && <p className="text-sm text-fg-subtle">{t("pendingHint")}</p>}
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
        {i.status === "returned" && (
          <Link href={`/initiatives/${i.id}/edit`} className="btn btn-primary h-10 px-4 text-sm" data-testid="edit">
            {t("editAndResend")}
          </Link>
        )}
        {i.status === "pending" && (
          <Link href={`/initiatives/${i.id}/edit`} className={smallBtn} data-testid="edit">
            {t("edit")}
          </Link>
        )}
        {editable && (
          <ActionForm action={withdrawInitiative} confirmText={t("withdrawConfirm")}>
            <input type="hidden" name="id" value={i.id} />
            <button type="submit" className={dangerBtn} data-testid="withdraw">
              {t("withdraw")}
            </button>
          </ActionForm>
        )}
        {i.status === "published" && (
          <Link href={`/initiatives/${i.id}`} className={smallBtn}>
            {t("details")}
            <Forward aria-hidden className="size-4" />
          </Link>
        )}
      </div>
    </article>
  );
}
