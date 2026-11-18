import { getLocale, getTranslations } from "next-intl/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { currentCohort, getMemberAttendance } from "@/lib/attendance/data";
import { formatShortDate, loc } from "@/lib/event-format";
import { hintClass, raisedPanelClass, panelTitle } from "@/components/admin/styles";
import { cn } from "@/lib/utils";
import { AttendanceMark } from "@/components/admin/attendance/attendance-mark";

/**
 * "My attendance" on /profile: the meetups this member was checked in at this season (from the
 * club's Luma check-in). RLS returns only the member's own rows.
 */
export async function MyAttendance({ supabase, memberId }: { supabase: SupabaseClient; memberId: string }) {
  const [t, locale] = await Promise.all([getTranslations("profile"), getLocale() as Promise<Locale>]);
  const cohort = await currentCohort(supabase);
  const { rows } = cohort ? await getMemberAttendance(supabase, memberId, cohort.id) : { rows: [] };
  const attended = rows.filter((r) => r.status === "checked_in");

  return (
    <section aria-labelledby="attendance-heading" className={cn(raisedPanelClass, "grid gap-3 p-5 sm:p-6")} data-testid="my-attendance">
      <h2 id="attendance-heading" className={panelTitle}>
        {t("attendanceTitle")}
      </h2>
      <div className="flex items-center gap-4">
        <p aria-hidden className="font-mono text-[2.75rem] leading-none font-medium text-brand-purple-softer tabular-nums">
          <bdi>{attended.length}</bdi>
        </p>
        <p className="text-fg-muted">{t("attendanceCount", { n: attended.length })}</p>
      </div>
      {attended.length > 0 && (
        <ul className="grid divide-y divide-border overflow-hidden rounded-md border border-border">
          {attended.map((r) => (
            <li key={r.event.id}>
              <Link
                href={`/events/${r.event.slug}`}
                className="flex items-center gap-3 bg-bg-deep/40 px-3.5 py-3 transition-colors duration-150 hover:bg-surface-hover"
              >
                <AttendanceMark status="checked_in" />
                <bdi className="w-11 shrink-0 font-mono text-[0.8125rem] text-fg-subtle">{formatShortDate(r.event.starts_at, locale)}</bdi>
                <span className="min-w-0 font-medium text-fg">{loc(r.event, "title", locale)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className={hintClass}>{t("attendanceHint")}</p>
    </section>
  );
}
