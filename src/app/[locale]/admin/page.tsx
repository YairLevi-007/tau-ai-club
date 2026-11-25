import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AlertCircle, ArrowLeft, ArrowRight, CalendarClock, CircleCheck, UsersRound } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requireAdmin } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { getAdminOverview, type Attention } from "@/lib/admin/overview";
import { formatShortDate, loc } from "@/lib/event-format";
import { AdminHeader } from "@/components/admin/admin-header";
import { hintClass, panelClass, panelTitle } from "@/components/admin/styles";
import { RateBar } from "@/components/admin/attendance/attendance-mark";
import { UploadSteps } from "@/components/admin/attendance/upload-steps";
import { uploadCounts } from "@/lib/attendance/phases";
import { BidiText } from "@/components/events/bidi-text";
import { cn } from "@/lib/utils";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin" });
  return { title: t("overviewTitle"), robots: { index: false, follow: false } };
}

/**
 * The admin home (DECISIONS 25.11): the tracking at a glance. What needs attention first, then
 * the next session and its two Luma uploads, the members, and attendance per session. Admins
 * only (requireAdmin: guests go to log-in, members get a 404); every read goes through RLS.
 */
export default async function AdminHome({ params }: PageProps<"/[locale]/admin">) {
  const { locale: l } = await params;
  const locale = l as Locale;
  setRequestLocale(locale);
  await requireAdmin("/admin");
  const t = await getTranslations("admin");
  const supabase = await createClient();
  const o = supabase ? await getAdminOverview(supabase) : null;
  const Arrow = locale === "he" ? ArrowLeft : ArrowRight;
  const title = (s: { event: { title_he: string; title_en: string; slug: string } }) => loc(s.event, "title", locale) ?? s.event.slug;
  const date = (iso: string) => <bdi dir="ltr" className="font-mono text-[0.8125rem]">{formatShortDate(iso, locale)}</bdi>;
  const more = "inline-flex min-h-11 w-fit items-center gap-1.5 text-sm text-brand-purple-soft underline-offset-4 hover:text-fg hover:underline";

  const attentionItem = (a: Attention) => {
    switch (a.kind) {
      case "before_missing":
      case "after_missing":
        return {
          // The message, then the session on its own line (date, then the mixed-language title), so bidi can't tangle them.
          text: (
            <span className="grid gap-0.5">
              <span>{t(a.kind === "before_missing" ? "attnBeforeMissing" : "attnAfterMissing")}</span>
              <span className="text-fg-muted">
                {date(a.session.event.starts_at)} <BidiText text={title(a.session)} />
              </span>
            </span>
          ),
          href: "/admin/attendance#uploads",
        };
      case "initiatives_pending":
        return { text: t("attnInitiatives", { n: a.n }), href: "/admin/initiatives" };
    }
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6" data-testid="admin-home">
      <AdminHeader title={t("overviewTitle")} body={t("overviewBody")} alert={!o || o.error ? t("errorGeneric") : null} />

      {o && (
        <>
          <section aria-labelledby="attention-heading" className={cn(panelClass, "grid gap-3 p-4 sm:p-5")} data-testid="admin-attention">
            <h2 id="attention-heading" className={cn(panelTitle, "flex items-center gap-2")}>
              <AlertCircle aria-hidden className="size-5 text-brand-purple-soft" />
              {t("attentionTitle")}
            </h2>
            {o.attention.length === 0 ? (
              <p className="inline-flex items-center gap-2 text-fg-muted" data-testid="attention-none">
                <CircleCheck aria-hidden className="size-4 text-brand-purple-soft" />
                {t("attentionNone")}
              </p>
            ) : (
              <ul className="grid gap-1.5">
                {o.attention.map((a, i) => {
                  const it = attentionItem(a);
                  return (
                    <li key={i} data-testid="attention-item" data-kind={a.kind}>
                      <Link
                        href={it.href}
                        className="flex min-h-11 items-center justify-between gap-3 rounded-md border border-border bg-bg-deep/40 px-3.5 py-2 text-sm text-fg transition-colors duration-150 hover:border-border-accent"
                      >
                        <span>{it.text}</span>
                        <Arrow aria-hidden className="size-4 shrink-0 text-fg-subtle" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section aria-labelledby="next-heading" className={cn(panelClass, "grid content-start gap-3 p-4 sm:p-5")} data-testid="admin-next">
              <h2 id="next-heading" className={cn(panelTitle, "flex items-center gap-2")}>
                <CalendarClock aria-hidden className="size-5 text-brand-purple-soft" />
                {t("nextSessionTitle")}
              </h2>
              {o.next ? (
                <>
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold text-fg">
                    {date(o.next.event.starts_at)}
                    <Link href={`/admin/events/${o.next.event.id}`} className="underline-offset-4 hover:underline">
                      <BidiText text={title(o.next)} />
                    </Link>
                  </p>
                  <UploadSteps before={o.next.before} after={o.next.after} phase={o.next.phase} endsAt={o.next.event.ends_at} counts={uploadCounts(o.next.info)} />
                  <Link href="/admin/attendance#uploads" className={more}>
                    {t("goUploads")}
                    <Arrow aria-hidden className="size-4" />
                  </Link>
                </>
              ) : (
                <p className="text-fg-muted">{t("noNextSession")}</p>
              )}
            </section>

            <section aria-labelledby="members-heading" className={cn(panelClass, "grid content-start gap-3 p-4 sm:p-5")} data-testid="admin-members">
              <h2 id="members-heading" className={cn(panelTitle, "flex items-center gap-2")}>
                <UsersRound aria-hidden className="size-5 text-brand-purple-soft" />
                {t("membersTitle")}
              </h2>
              <p className="font-mono text-[2rem] leading-none font-medium text-fg tabular-nums" data-testid="admin-members-total">
                <bdi>{o.members.total}</bdi>
              </p>
              <p className={hintClass}>{t("membersDetail", { admins: o.members.admins, signedIn: o.members.signedIn })}</p>
              <Link href="/admin/members" className={more}>
                {t("goMembers")}
                <Arrow aria-hidden className="size-4" />
              </Link>
            </section>
          </div>

          <section aria-labelledby="sessions-heading" className={cn(panelClass, "grid gap-3 p-4 sm:p-5")} data-testid="admin-sessions">
            <h2 id="sessions-heading" className={panelTitle}>
              {t("sessionsTitle")}
            </h2>
            {o.sessions.length === 0 ? (
              <p className="text-fg-muted">{t("sessionsEmpty")}</p>
            ) : (
              <ul className="grid divide-y divide-border">
                {o.sessions.map((s) => (
                  <li key={s.session.event.id} className="grid gap-1 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4" data-testid="admin-session">
                    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                      {date(s.session.event.starts_at)}
                      <Link href={`/admin/events/${s.session.event.id}`} className="min-w-0 font-medium text-fg underline-offset-4 hover:underline">
                        <BidiText text={title(s.session)} />
                      </Link>
                    </span>
                    <span className="flex items-center gap-3 text-sm text-fg-muted">
                      {s.imported ? (
                        <>
                          <span>{t("sessionCame", { members: s.members, guests: s.guests })}</span>
                          <RateBar rate={o.members.total ? s.members / o.members.total : null} />
                        </>
                      ) : (
                        <span className="text-fg-subtle">{t("sessionNoData")}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/admin/attendance" className={more}>
              {t("goAttendance")}
              <Arrow aria-hidden className="size-4" />
            </Link>
          </section>
        </>
      )}
    </div>
  );
}
