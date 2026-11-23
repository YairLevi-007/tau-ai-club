import { getTranslations } from "next-intl/server";
import { CalendarDays, Check, Clock, MapPin, Sparkles } from "lucide-react";
import type { Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { loc } from "@/lib/event-format";
import { NAMES_VISIBLE_TO_ALL_MEMBERS, signupOpen, type Initiative, type InitiativeStatus } from "@/lib/initiatives";
import { ActionForm } from "@/components/admin/action-form";
import { raisedPanelClass, smallBtn } from "@/components/admin/styles";
import { BidiText } from "@/components/events/bidi-text";
import { MemberAvatar } from "@/components/members/member-avatar";
import { cn } from "@/lib/utils";
import { joinInitiative, leaveInitiative } from "@/app/[locale]/initiatives/actions";

/** "2026-12-10" (a date with no time) → "10.12", or "10.12.2027" outside this year. Always LTR. */
export function shortDay(day: string, thisYear: number) {
  const [y, m, d] = day.split("-").map(Number);
  return y === thisYear ? `${d}.${m}` : `${d}.${m}.${y}`;
}

/** A club initiative's card: the purple frame and glow, as in design/initiatives/kinds.png. */
export const clubCardClass = "border-brand-purple shadow-[var(--shadow-featured)] [background-image:var(--card-featured-bg)]";

/** "יוזמת המועדון" (purple frame, sparkle icon: the 12px logo read as noise, QA) or the plain grey "יוזמה של חבר". */
export async function KindBadge({ kind }: { kind: Initiative["kind"] }) {
  const t = await getTranslations("initiatives");
  if (kind === "club") {
    return (
      <span className="tag gap-1.5 border-brand-purple font-semibold text-fg" data-testid="kind-club">
        <Sparkles aria-hidden className="size-3.5 text-brand-purple-soft" />
        {t("kindClub")}
      </span>
    );
  }
  return (
    <span className="tag" data-testid="kind-member">
      {t("kindMember")}
    </span>
  );
}

export async function CategoryTag({ category }: { category: Initiative["category"] }) {
  const t = await getTranslations("initiatives");
  return <span className="tag">{t(`category.${category}`)}</span>;
}

/** The lead's own view: where their proposal stands. Text plus an icon, never colour alone. */
export async function StatusTag({ status }: { status: InitiativeStatus }) {
  const t = await getTranslations("initiatives");
  return (
    <span
      className={cn("tag gap-1.5", status === "pending" && "tag-tentative", status === "returned" && "border-brand-purple text-fg", status === "published" && "tag-next")}
      data-testid="initiative-status"
      data-status={status}
    >
      {status === "published" ? <Check aria-hidden className="size-3.5" /> : <Clock aria-hidden className="size-3.5" />}
      {t(`status.${status}`)}
    </span>
  );
}

/** When and where, as the lead wrote them. */
export function WhenWhere({ initiative, className }: { initiative: Initiative; className?: string }) {
  if (!initiative.when_text && !initiative.where_text) return null;
  return (
    <ul className={cn("grid gap-1.5 text-sm text-fg-muted", className)}>
      {initiative.when_text && (
        <li className="flex items-center gap-2">
          <CalendarDays aria-hidden className="size-4 shrink-0 text-brand-purple-soft" />
          <BidiText text={initiative.when_text} />
        </li>
      )}
      {initiative.where_text && (
        <li className="flex items-center gap-2">
          <MapPin aria-hidden className="size-4 shrink-0 text-brand-purple-soft" />
          <BidiText text={initiative.where_text} />
        </li>
      )}
    </ul>
  );
}

/** "6 בפנים · עוד 4 מקומות", or full / closed. */
export async function Headcount({ initiative, today }: { initiative: Initiative; today: string }) {
  const t = await getTranslations("initiatives");
  const { joined_count: n, spots } = initiative;
  const closed = initiative.signup_until != null && initiative.signup_until < today;
  const parts = [spots ? t("joinedOfSpots", { n, spots }) : t("joinedCount", { n })];
  if (spots && n >= spots) parts.push(t("full"));
  else if (closed) parts.push(t("closed"));
  else if (spots) parts.push(t("spotsLeft", { n: spots - n }));
  return (
    <p className="text-sm text-fg-muted" data-testid="headcount">
      {parts.join(" · ")}
    </p>
  );
}

/**
 * "אני בפנים" / "ביטול ההרשמה" for a published initiative. The lead leads it and doesn't join.
 * Shown only while sign-up is open (or to someone already in, so they can cancel).
 */
export async function JoinControl({ initiative, viewerId, today, wide = false }: { initiative: Initiative; viewerId: string; today: string; wide?: boolean }) {
  const t = await getTranslations("initiatives");
  if (initiative.status !== "published" || initiative.lead_id === viewerId) return null;
  if (initiative.i_joined) {
    return (
      <ActionForm action={leaveInitiative} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="id" value={initiative.id} />
        <span className="inline-flex items-center gap-1.5 font-semibold text-brand-purple-soft" data-testid="youre-in">
          <Check aria-hidden className="size-4" />
          {t("youreIn")}
        </span>
        <button type="submit" className={smallBtn} data-testid="leave">
          {t("cancelIn")}
        </button>
      </ActionForm>
    );
  }
  if (!signupOpen(initiative, today)) return null;
  return (
    <ActionForm action={joinInitiative} className={cn("flex flex-wrap items-center gap-2", wide && "w-full")}>
      <input type="hidden" name="id" value={initiative.id} />
      <button type="submit" className={cn("btn btn-primary h-11 px-6", wide && "w-full")} data-testid="join">
        {t("imIn")}
      </button>
      {NAMES_VISIBLE_TO_ALL_MEMBERS && <p className="basis-full text-xs text-fg-subtle">{t("namesVisibleNote")}</p>}
    </ActionForm>
  );
}

/** The lead: photo or initials, name, "מי מוביל". */
export async function LeadLine({ initiative, photoSrc }: { initiative: Initiative; photoSrc: string | null }) {
  const t = await getTranslations("initiatives");
  // Only active members show by name: a lead who left shows as such (security review F1).
  if (!initiative.lead_name) return <p className="text-sm text-fg-subtle">{t("leadGone")}</p>;
  return (
    <div className="flex items-center gap-3">
      <MemberAvatar name={initiative.lead_name} src={photoSrc} size={40} />
      <div className="min-w-0">
        <p className="leading-tight font-semibold text-fg">{initiative.lead_name}</p>
        <p className="text-xs text-brand-purple-soft">{t("leadLabel")}</p>
      </div>
    </div>
  );
}

/** One initiative in the list (design/initiatives/kinds.png, card 01). */
export async function InitiativeCard({
  initiative,
  locale,
  viewerId,
  today,
  photoSrc,
}: {
  initiative: Initiative;
  locale: Locale;
  viewerId: string;
  today: string;
  photoSrc: string | null;
}) {
  const t = await getTranslations("initiatives");
  const title = loc(initiative, "title", locale) ?? "";
  const summary = loc(initiative, "summary", locale);
  const thisYear = Number(today.slice(0, 4));
  return (
    <article
      className={cn(raisedPanelClass, "relative flex h-full flex-col gap-3 p-5 sm:p-6", initiative.kind === "club" && clubCardClass)}
      data-testid="initiative-card"
      data-kind={initiative.kind}
    >
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <KindBadge kind={initiative.kind} />
        <CategoryTag category={initiative.category} />
        {initiative.signup_until && (
          <span className="text-fg-subtle">
            {t.rich("signupUntil", { date: shortDay(initiative.signup_until!, thisYear), ltr: (c) => <bdi dir="ltr" className="font-mono">{c}</bdi> })}
          </span>
        )}
      </div>
      <h3 className="text-xl leading-snug font-bold text-balance text-fg">
        <Link href={`/initiatives/${initiative.id}`} className="rounded-sm hover:text-brand-purple-softer">
          <BidiText text={title} />
        </Link>
      </h3>
      {summary && <p className="line-clamp-3 max-w-[68ch] text-fg-muted">{summary}</p>}
      <WhenWhere initiative={initiative} />
      <div className="mt-auto grid gap-4 pt-1">
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <Headcount initiative={initiative} today={today} />
          <JoinControl initiative={initiative} viewerId={viewerId} today={today} />
        </div>
        <div className="border-t border-border pt-4">
          <LeadLine initiative={initiative} photoSrc={photoSrc} />
        </div>
      </div>
    </article>
  );
}
