import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Download } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requireAdmin } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { currentCohort, getSeasonAttendance } from "@/lib/attendance/data";
import { formatShortDate, loc } from "@/lib/event-format";
import { AdminHeader } from "@/components/admin/admin-header";
import { hintClass, panelClass, smallBtn } from "@/components/admin/styles";
import { cn } from "@/lib/utils";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/attendance">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "attendance" });
  return { title: t("seasonTitle"), robots: { index: false, follow: false } };
}

/**
 * The season at a glance: members × meetups. ✓ checked in, ✗ didn't (the event was imported
 * but they weren't checked in), – no Luma import for that event yet.
 */
export default async function AdminAttendancePage({ params }: PageProps<"/[locale]/admin/attendance">) {
  const { locale: l } = await params;
  const locale = l as Locale;
  setRequestLocale(locale);
  await requireAdmin("/admin/attendance");
  const t = await getTranslations("attendance");
  const supabase = await createClient();
  const cohort = supabase ? await currentCohort(supabase) : null;
  const season = supabase && cohort ? await getSeasonAttendance(supabase, cohort.id) : null;
  const pct = (r: number | null) => (r === null ? "–" : `${Math.round(r * 100)}%`);

  return (
    <div className="grid gap-6">
      <AdminHeader title={t("seasonTitle")} body={t("seasonBody")} alert={season?.error ? t("errorLoad") : null} />

      {cohort && season && (
        <div className="flex flex-wrap items-center gap-3">
          <a href={`/api/admin/attendance?cohort=${cohort.id}`} className={smallBtn} download data-testid="attendance-export">
            <Download aria-hidden />
            {t("export")}
          </a>
          <p className={hintClass}>{t("exportHint")}</p>
        </div>
      )}

      {!season || season.events.length === 0 ? (
        <p className="text-fg-muted">{t("seasonEmpty")}</p>
      ) : (
        <div className={cn(panelClass, "overflow-x-auto")}>
          <table className="w-full border-collapse text-sm" data-testid="attendance-grid">
            <caption className="sr-only">{t("gridCaption")}</caption>
            <thead>
              <tr className="border-b border-border text-fg-subtle">
                <th scope="col" className="px-3 py-2 text-start font-medium">
                  {t("member")}
                </th>
                {season.events.map((e) => (
                  <th key={e.id} scope="col" className="px-2 py-2 text-center font-medium whitespace-nowrap">
                    <Link href={`/admin/events/${e.id}`} title={loc(e, "title", locale) ?? e.slug} className="underline-offset-4 hover:underline">
                      <bdi>{formatShortDate(e.starts_at, locale)}</bdi>
                    </Link>
                    <span className="block text-[0.6875rem] font-normal">
                      {season.imports.has(e.id) ? t("guestsShort", { n: season.imports.get(e.id)!.guests_checked_in }) : t("notImported")}
                    </span>
                  </th>
                ))}
                <th scope="col" className="px-3 py-2 text-end font-medium">
                  {t("rate")}
                </th>
              </tr>
            </thead>
            <tbody>
              {season.members.map((m) => (
                <tr key={m.id} className="border-b border-border last:border-0" data-testid="attendance-row">
                  <th scope="row" className="px-3 py-2 text-start font-normal whitespace-nowrap">
                    <Link href={`/admin/attendance/${m.id}`} className="text-fg underline-offset-4 hover:underline">
                      {m.full_name}
                    </Link>
                  </th>
                  {season.events.map((e) => {
                    const c = season.cells.get(`${m.id}:${e.id}`);
                    const imported = season.imports.has(e.id);
                    const came = c?.status === "checked_in";
                    const label = !imported ? t("cellNoData") : came ? t("status_checked_in") : c ? t(`status_${c.status}`) : t("cellNotRegistered");
                    return (
                      <td key={e.id} className="px-2 py-2 text-center">
                        <span aria-hidden className={came ? "text-brand-purple-soft" : "text-fg-faint"}>
                          {!imported ? "–" : came ? "✓" : "✗"}
                        </span>
                        <span className="sr-only">{label}</span>
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-end tabular-nums text-fg-muted">
                    <bdi>{pct(m.rate)}</bdi>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className={hintClass}>{t("gridLegend")}</p>
    </div>
  );
}
