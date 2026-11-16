import { getLocale, getTranslations } from "next-intl/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { currentCohort, getMemberAttendance } from "@/lib/attendance/data";
import { formatShortDate, loc } from "@/lib/event-format";
import { hintClass, panelClass, panelTitle } from "@/components/admin/styles";
import { cn } from "@/lib/utils";

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
    <section aria-labelledby="attendance-heading" className={cn(panelClass, "mt-5 grid gap-3 p-5 sm:p-6 lg:mt-8")} data-testid="my-attendance">
      <h2 id="attendance-heading" className={panelTitle}>
        {t("attendanceTitle")}
      </h2>
      <p className="text-fg-muted">{t("attendanceCount", { n: attended.length })}</p>
      {attended.length > 0 && (
        <ul className="grid gap-1.5">
          {attended.map((r) => (
            <li key={r.event.id} className="flex flex-wrap items-baseline gap-x-2">
              <bdi className="text-sm text-fg-subtle">{formatShortDate(r.event.starts_at, locale)}</bdi>
              <Link href={`/events/${r.event.slug}`} className="text-fg underline-offset-4 hover:underline">
                {loc(r.event, "title", locale)}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className={hintClass}>{t("attendanceHint")}</p>
    </section>
  );
}
