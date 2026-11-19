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
import { AttendanceMark, RateBar } from "@/components/admin/attendance/attendance-mark";

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

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
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
        // On a phone the dates don't fit beside the names: names are cut short (full name on hover
        // and on the member's page) and a fade at the end edge shows the grid scrolls. The grid
        // itself stays dense (DECISIONS 18.11). Round 2, item 10.
        <div className="relative">
        <div className={cn(panelClass, "relative overflow-x-auto overscroll-x-contain")}>
          <table className="w-full border-separate border-spacing-0 text-sm" data-testid="attendance-grid">
            <caption className="sr-only">{t("gridCaption")}</caption>
            <thead>
              <tr className="text-fg-subtle">
                <th scope="col" className="sticky start-0 z-10 border-b border-border bg-bg [background-image:linear-gradient(var(--surface),var(--surface))] px-3 py-3 text-start text-xs font-medium sm:px-4">
                  {t("member")}
                </th>
                {season.events.map((e) => {
                  const imp = season.imports.get(e.id);
                  return (
                    <th key={e.id} scope="col" className="border-b border-border px-2 py-3 text-center font-medium whitespace-nowrap">
                      <Link
                        href={`/admin/events/${e.id}`}
                        title={loc(e, "title", locale) ?? e.slug}
                        className="font-mono text-[0.8125rem] text-fg-muted underline-offset-4 hover:text-fg hover:underline"
                      >
                        <bdi>{formatShortDate(e.starts_at, locale)}</bdi>
                      </Link>
                      <span className={cn("mt-0.5 block text-xs font-normal", imp ? "text-fg-muted" : "text-fg-subtle")}>
                        {imp ? t("guestsShort", { n: imp.guests_checked_in }) : t("notImported")}
                      </span>
                    </th>
                  );
                })}
                <th scope="col" className="border-b border-border px-4 py-3 text-end text-xs font-medium">
                  {t("rate")}
                </th>
              </tr>
            </thead>
            <tbody>
              {season.members.map((m) => (
                <tr key={m.id} className="group/row" data-testid="attendance-row">
                  <th
                    scope="row"
                    className="sticky start-0 z-10 border-b border-border bg-bg [background-image:linear-gradient(var(--surface),var(--surface))] px-3 py-2.5 text-start font-normal whitespace-nowrap sm:px-4 group-last/row:border-0 group-hover/row:[background-image:linear-gradient(var(--surface-hover),var(--surface-hover)),linear-gradient(var(--surface),var(--surface))]"
                  >
                    <Link
                      href={`/admin/attendance/${m.id}`}
                      title={m.full_name}
                      className="block max-w-[8.5rem] truncate font-medium text-fg underline-offset-4 hover:underline sm:max-w-none"
                    >
                      {m.full_name}
                    </Link>
                  </th>
                  {season.events.map((e) => {
                    const c = season.cells.get(`${m.id}:${e.id}`);
                    const imported = season.imports.has(e.id);
                    const came = c?.status === "checked_in";
                    const label = !imported ? t("cellNoData") : came ? t("status_checked_in") : c ? t(`status_${c.status}`) : t("cellNotRegistered");
                    return (
                      <td
                        key={e.id}
                        className="border-b border-border px-2 py-2.5 transition-colors duration-150 group-last/row:border-0 group-hover/row:bg-surface-hover"
                      >
                        <span className="grid place-items-center" title={label}>
                          <AttendanceMark status={!imported ? "nodata" : c ? c.status : "none"} />
                        </span>
                        <span className="sr-only">{label}</span>
                      </td>
                    );
                  })}
                  <td className="border-b border-border px-4 py-2.5 text-end transition-colors duration-150 group-last/row:border-0 group-hover/row:bg-surface-hover">
                    <RateBar rate={m.rate} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-px end-px w-10 rounded-e-lg from-bg/90 to-transparent sm:hidden ltr:bg-linear-to-l rtl:bg-linear-to-r"
        />
        </div>
      )}
      <ul className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-fg-subtle" aria-label={t("legendTitle")}>
        {(
          [
            ["checked_in", "status_checked_in"],
            ["registered", "status_registered"],
            ["no_show", "status_no_show"],
            ["none", "cellNotRegistered"],
            ["nodata", "cellNoData"],
          ] as const
        ).map(([st, key]) => (
          <li key={st} className="inline-flex items-center gap-2">
            <AttendanceMark status={st} />
            {t(key)}
          </li>
        ))}
      </ul>
      <p className={hintClass}>{t("gridLegend")}</p>
    </div>
  );
}
