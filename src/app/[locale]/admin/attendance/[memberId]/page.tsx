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
      <p className="text-fg" data-testid="member-rate">
        {imported.length ? t("memberRate", { came, total: imported.length, pct: Math.round((came / imported.length) * 100) }) : t("memberNoData")}
      </p>
      {imported.length > 0 && (
        <ul className={cn(panelClass, "divide-y divide-border")} data-testid="member-history">
          {imported.map((e) => {
            const r = byEvent.get(e.id);
            const status = r?.status ?? null;
            return (
              <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3">
                <Link href={`/admin/events/${e.id}`} className="text-fg underline-offset-4 hover:underline">
                  <bdi>{formatShortDate(e.starts_at, locale)}</bdi> · {loc(e, "title", locale)}
                </Link>
                <span className={cn("text-sm", status === "checked_in" ? "text-brand-purple-soft" : "text-fg-subtle")}>
                  {status ? t(`status_${status}`) : t("cellNotRegistered")}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <Link href="/admin/attendance" className="text-sm text-fg-muted underline-offset-4 hover:underline">
        {t("backToSeason")}
      </Link>
    </div>
  );
}
