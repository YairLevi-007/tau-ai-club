import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Check, Plus } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { TIME_ZONE, type Locale } from "@/i18n/routing";
import { requireAdmin } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { signPhotos } from "@/lib/members/photos";
import { getInitiatives, israelToday, type Initiative, type InitiativeStatus } from "@/lib/initiatives";
import { loc } from "@/lib/event-format";
import { AdminHeader } from "@/components/admin/admin-header";
import { ActionForm } from "@/components/admin/action-form";
import { dangerBtn, hintClass, inputClass, labelClass, raisedPanelClass, smallBtn } from "@/components/admin/styles";
import { BidiText } from "@/components/events/bidi-text";
import { CategoryTag, Headcount, KindBadge, LeadLine, StatusTag, WhenWhere, clubCardClass } from "@/components/initiatives/initiative-bits";
import { ClubSwitch } from "@/components/initiatives/club-switch";
import { cn } from "@/lib/utils";
import { removeInitiative, reviewInitiative } from "./actions";

const TABS = ["pending", "published", "returned", "rejected"] as const satisfies readonly InitiativeStatus[];
type Tab = (typeof TABS)[number];

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/initiatives">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "initiativesAdmin" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

/**
 * The admin's Initiatives tab (design/initiatives approval.png, k-admin-approve): proposals
 * waiting for an answer (publish, with the club switch starting from the member's choice; return
 * with a note; reject), and what's published (edit, remove), returned or turned down. An admin's
 * own initiative skips the queue: "New club initiative" posts it at once.
 */
export default async function AdminInitiativesPage({ params, searchParams }: PageProps<"/[locale]/admin/initiatives">) {
  const { locale: l } = await params;
  const locale = l as Locale;
  setRequestLocale(locale);
  await requireAdmin("/admin/initiatives");
  const sp = await searchParams;
  const tab: Tab = TABS.includes(sp.tab as Tab) ? (sp.tab as Tab) : "pending";
  const done = typeof sp.done === "string" && ["sent", "not-configured", "failed"].includes(sp.done) ? sp.done : null;

  const [t, ti, supabase] = await Promise.all([getTranslations("initiativesAdmin"), getTranslations("initiatives"), createClient()]);
  const all = supabase ? await getInitiatives(supabase) : null;
  const byStatus = (s: Tab) => (all ?? []).filter((i) => i.status === s);
  // The queue: oldest first, so nobody waits longest.
  const shown = tab === "pending" ? byStatus(tab).reverse() : byStatus(tab);
  const photos = supabase ? await signPhotos(supabase, shown.map((i) => i.lead_photo)) : new Map<string, string>();
  const photoOf = (i: Initiative) => (i.lead_photo ? (photos.get(i.lead_photo) ?? null) : null);
  const today = israelToday();
  const sentAt = (iso: string) =>
    new Intl.DateTimeFormat(locale, { timeZone: TIME_ZONE, day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  const tabLabel: Record<Tab, string> = { pending: t("tabPending"), published: t("tabPublished"), returned: t("tabReturned"), rejected: t("tabRejected") };
  const empty: Record<Tab, string> = { pending: t("emptyPending"), published: t("emptyPublished"), returned: t("emptyReturned"), rejected: t("emptyRejected") };
  const doneText = done === "sent" ? t("doneMailed") : done === "not-configured" ? t("doneNoMail") : done === "failed" ? t("doneMailFailed") : null;

  return (
    <div className="grid gap-8">
      <AdminHeader
        title={t("title")}
        body={t("intro")}
        alert={all === null ? ti("loadError") : null}
        action={
          <Link href="/initiatives/new" className="btn btn-primary h-10 w-full px-4 text-sm sm:w-fit">
            <Plus aria-hidden className="size-4" />
            {t("newClub")}
          </Link>
        }
      />

      {doneText && (
        <p role="status" className={cn(raisedPanelClass, "flex items-center gap-2 px-4 py-3 text-fg")} data-testid="review-done">
          <Check aria-hidden className="size-4 shrink-0 text-brand-purple-soft" />
          {doneText}
        </p>
      )}

      <nav aria-label={t("tabsLabel")}>
        <ul className="flex flex-wrap gap-2">
          {TABS.map((s) => (
            <li key={s}>
              <Link
                href={s === "pending" ? "/admin/initiatives" : { pathname: "/admin/initiatives", query: { tab: s } }}
                aria-current={s === tab ? "page" : undefined}
                className={cn("btn h-10 rounded-full px-4 text-sm", s === tab ? "btn-primary" : "btn-ghost")}
                data-testid={`admin-tab-${s}`}
              >
                {tabLabel[s]}
                <span className="font-mono text-xs opacity-80" aria-label={`(${byStatus(s).length})`}>
                  · {byStatus(s).length}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {shown.length === 0 ? (
        <p className="text-fg-muted">{empty[tab]}</p>
      ) : (
        <ul className="grid gap-4">
          {shown.map((i) => {
            const title = loc(i, "title", locale) ?? "";
            const summary = loc(i, "summary", locale);
            return (
              <li key={i.id}>
                <article
                  className={cn(raisedPanelClass, "grid gap-4 p-5 sm:p-6", i.status === "published" && i.kind === "club" && clubCardClass)}
                  data-testid="admin-initiative"
                  data-status={i.status}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      {i.status === "published" ? <KindBadge kind={i.kind} /> : <StatusTag status={i.status} />}
                      <CategoryTag category={i.category} />
                    </div>
                    <span className="text-fg-subtle">
                      <bdi dir="ltr">{sentAt(i.status === "published" && i.published_at ? i.published_at : i.submitted_at)}</bdi>
                    </span>
                  </div>
                  <h2 className="text-xl leading-snug font-bold text-balance text-fg">
                    {i.status === "published" ? (
                      <Link href={`/initiatives/${i.id}`} className="rounded-sm hover:text-brand-purple-softer">
                        <BidiText text={title} />
                      </Link>
                    ) : (
                      <BidiText text={title} />
                    )}
                  </h2>
                  {summary && <p className="max-w-[80ch] whitespace-pre-line text-fg-muted">{summary}</p>}
                  <WhenWhere initiative={i} />
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                    <LeadLine initiative={i} photoSrc={photoOf(i)} />
                    {i.status === "published" && <Headcount initiative={i} today={today} />}
                  </div>

                  {i.status === "pending" && (
                    <div className="grid gap-3">
                      <p className="text-sm text-brand-purple-soft" data-testid="proposed-kind">
                        {i.proposed_kind === "club" ? t("askedClub") : t("askedMember")}
                      </p>
                      <ActionForm action={reviewInitiative} className="grid gap-3">
                        <input type="hidden" name="id" value={i.id} />
                        <ClubSwitch
                          startOn={i.proposed_kind === "club"}
                          labels={{
                            switchLabel: t("clubSwitch"),
                            onHint: t("clubSwitchOnHint"),
                            offHint: t("clubSwitchOffHint"),
                            reason: t("reasonLabel"),
                            approve: t("approve"),
                            approveClub: t("approveClub"),
                            badge: ti("kindClub"),
                          }}
                        />
                      </ActionForm>
                      <div className="flex flex-wrap gap-2">
                        <details className="group w-full rounded-lg border border-border open:bg-bg-deep/40 sm:w-auto sm:open:w-full">
                          <summary className={cn(smallBtn, "w-full cursor-pointer list-none sm:w-fit")} data-testid="return-open">
                            {t("returnWithNote")}
                          </summary>
                          <ActionForm action={reviewInitiative} className="grid gap-3 p-4 pt-1">
                            <input type="hidden" name="id" value={i.id} />
                            <label className={labelClass}>
                              {t("noteLabel")}
                              <textarea name="note" required rows={3} maxLength={1000} aria-describedby={`note-hint-${i.id}`} className={cn(inputClass, "h-auto py-2 leading-relaxed")} />
                              <span id={`note-hint-${i.id}`} className={hintClass}>
                                {t("noteHint")}
                              </span>
                            </label>
                            <button type="submit" name="decision" value="return" className="btn btn-primary h-10 w-full px-4 text-sm sm:w-fit" data-testid="return">
                              {t("sendBack")}
                            </button>
                          </ActionForm>
                        </details>
                        <details className="group w-full rounded-lg border border-border open:bg-bg-deep/40 sm:w-auto sm:open:w-full">
                          <summary className={cn(dangerBtn, "w-full cursor-pointer list-none sm:w-fit")} data-testid="reject-open">
                            {t("reject")}
                          </summary>
                          <ActionForm action={reviewInitiative} confirmText={t("rejectConfirm")} className="grid gap-3 p-4 pt-1">
                            <input type="hidden" name="id" value={i.id} />
                            <label className={labelClass}>
                              {t("rejectNoteLabel")}
                              <textarea name="note" rows={2} maxLength={1000} className={cn(inputClass, "h-auto py-2 leading-relaxed")} />
                            </label>
                            <button type="submit" name="decision" value="reject" className={cn(dangerBtn, "w-full sm:w-fit")} data-testid="reject">
                              {t("rejectSend")}
                            </button>
                          </ActionForm>
                        </details>
                      </div>
                    </div>
                  )}

                  {(i.status === "returned" || i.status === "rejected") && i.review_note && (
                    <p className="rounded-md border-s-2 border-brand-purple bg-bg-deep/60 px-4 py-3 text-fg-muted">
                      <span className="font-semibold text-fg">{t("noteSent")}</span> {i.review_note}
                    </p>
                  )}

                  {i.status === "published" && (
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/admin/initiatives/${i.id}/edit`} className={smallBtn} data-testid="admin-edit">
                        {t("edit")}
                      </Link>
                      <ActionForm action={removeInitiative} confirmText={t("removeConfirm")}>
                        <input type="hidden" name="id" value={i.id} />
                        <button type="submit" className={dangerBtn} data-testid="admin-remove">
                          {t("remove")}
                        </button>
                      </ActionForm>
                    </div>
                  )}
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
