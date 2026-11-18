import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requireAdmin } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { currentCohort, getMemberAttendance, getSeasonAttendance } from "@/lib/attendance/data";
import { formatShortDate, loc } from "@/lib/event-format";
import { AdminHeader } from "@/components/admin/admin-header";
import { panelClass } from "@/components/admin/styles";
import { cn } from "@/lib/utils";
import { AttendanceMark, AttendanceTag } from "@/components/admin/attendance/attendance-mark";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/attendance/[memberId]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "attendance" });
  return { title: t("memberTitle"), robots: { index: false, follow: false } };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One member's season: every meetup with an import, and whether they came. */
export default async function AdminMemberAttendancePage({ params }: PageProps<"/[locale]/admin/attendance/[memberId]">) {
  const { locale: l, memberId } = await params;
  const locale = l as Locale;
  setRequestLocale(locale);
  await requireAdmin(`/admin/attendance/${memberId}`);
  if (!UUID.test(memberId)) notFound();
  const t = await getTranslations("attendance");
  const supabase = await createClient();
  if (!supabase) notFound();
  const { data: member } = await supabase.from("members").select("id, full_name").eq("id", memberId).maybeSingle();
  if (!member) notFound();
  const cohort = await currentCohort(supabase);
  const [history, season] = cohort
    ? await Promise.all([getMemberAttendance(supabase, memberId, cohort.id), getSeasonAttendance(supabase, cohort.id)])
    : [null, null];
  const byEvent = new Map((history?.rows ?? []).map((r) => [r.event.id, r]));
  const imported = (season?.events ?? []).filter((e) => season!.imports.has(e.id));
  const came = imported.filter((e) => byEvent.get(e.id)?.status === "checked_in").length;

  return (
    <div className="grid gap-6">
      <AdminHeader title={member.full_name} body={t("memberBody")} alert={history?.error ? t("errorLoad") : null} />
      <div className={cn(panelClass, "flex flex-wrap items-center gap-x-5 gap-y-3 p-4 sm:p-5")}>
        {imported.length > 0 && (
          <p aria-hidden className="font-mono text-[2.5rem] leading-none font-medium text-brand-purple-softer tabular-nums">
            <bdi dir="ltr">
              {came}
              <span className="text-fg-faint">/{imported.length}</span>
            </bdi>
          </p>
        )}
        <div className="grid min-w-0 gap-2">
          <p className="text-fg" data-testid="member-rate">
            {imported.length ? t("memberRate", { came, total: imported.length, pct: Math.round((came / imported.length) * 100) }) : t("memberNoData")}
          </p>
          {imported.length > 0 && (
            <ol aria-hidden className="flex flex-wrap gap-1.5">
              {imported.map((e) => (
                <li key={e.id}>
                  <AttendanceMark status={byEvent.get(e.id)?.status ?? "none"} className="size-3" />
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
      {imported.length > 0 && (
        <ul className={cn(panelClass, "divide-y divide-border overflow-hidden")} data-testid="member-history">
          {imported.map((e) => {
            const r = byEvent.get(e.id);
            const status = r?.status ?? null;
            return (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
                <Link href={`/admin/events/${e.id}`} className="flex min-w-0 items-baseline gap-3 underline-offset-4 hover:underline">
                  <bdi className="shrink-0 font-mono text-[0.8125rem] text-fg-subtle">{formatShortDate(e.starts_at, locale)}</bdi>
                  <span className="font-medium text-fg">{loc(e, "title", locale)}</span>
                </Link>
                {status ? (
                  <AttendanceTag status={status} label={t(`status_${status}`)} />
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-border px-2 py-0.5 text-xs text-fg-subtle">
                    <AttendanceMark status="none" className="size-2" />
                    {t("cellNotRegistered")}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <Link href="/admin/attendance" className="inline-flex w-fit items-center gap-1.5 text-sm text-fg-muted underline-offset-4 hover:text-fg hover:underline">
        {t("backToSeason")}
      </Link>
    </div>
  );
}
