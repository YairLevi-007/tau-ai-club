import { getLocale, getTranslations } from "next-intl/server";
import { UsersRound } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getEventAttendance } from "@/lib/attendance/data";
import { formatShortDate } from "@/lib/event-format";
import { hintClass, panelClass, panelTitle } from "@/components/admin/styles";
import { cn } from "@/lib/utils";
import { AttendanceImport } from "./attendance-import";
import { AttendanceTag } from "./attendance-mark";

type Client = SupabaseClient;

/** "Attendance from Luma" on an event's admin page: the numbers, who came, and the CSV upload. */
export async function AttendancePanel({ supabase, eventId }: { supabase: Client; eventId: string }) {
  const [t, locale] = await Promise.all([getTranslations("attendance"), getLocale() as Promise<Locale>]);
  const { info, members } = await getEventAttendance(supabase, eventId);
  const n = (s: string) => members.filter((m) => m.status === s).length;
  const time = (iso: string) =>
    new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

  return (
    <section aria-labelledby="attendance-heading" className={cn(panelClass, "grid gap-4 p-4 sm:p-6")} data-testid="attendance-panel">
      <div className="grid gap-1">
        <h2 id="attendance-heading" className={cn(panelTitle, "flex items-center gap-2")}>
          <UsersRound aria-hidden className="size-5 text-brand-purple-soft" />
          {t("title")}
        </h2>
        <p className={hintClass}>{t("body")}</p>
      </div>

      {info ? (
        <div className="grid gap-3">
          <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-4" data-testid="attendance-counts">
            {(
              [
                ["registered", members.length + info.guests_registered],
                ["checkedIn", n("checked_in") + info.guests_checked_in],
                ["noShows", n("no_show")],
                ["guests", info.guests_registered],
              ] as const
            ).map(([k, v]) => (
              <div
                key={k}
                className={cn(
                  "grid gap-1 rounded-md border px-3.5 py-3",
                  k === "checkedIn" ? "border-border-accent bg-brand-purple-deeper/30" : "border-border bg-bg-deep/40",
                )}
              >
                <dt className="text-xs font-medium text-fg-subtle">{t(`stat_${k}`)}</dt>
                <dd
                  className={cn("font-mono text-[1.75rem] leading-none font-medium tabular-nums", k === "checkedIn" ? "text-brand-purple-softer" : "text-fg")}
                  data-testid={`stat-${k}`}
                >
                  <bdi>{v}</bdi>
                </dd>
              </div>
            ))}
          </dl>
          <p className={hintClass}>
            {t("statsHint", { members: members.length, checkedIn: n("checked_in"), guestsIn: info.guests_checked_in })}{" "}
            {t("importedOn", { date: formatShortDate(info.imported_at, locale) })}
          </p>
          {members.length > 0 ? (
            <ul className="grid gap-1.5 sm:grid-cols-2" data-testid="attendance-members">
              {members.map((m) => (
                <li key={m.member_id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-md border border-border bg-bg-deep/40 px-3.5 py-2.5 text-sm">
                  <Link href={`/admin/attendance/${m.member_id}`} className="min-w-0 font-medium text-fg underline-offset-4 hover:underline">
                    {m.full_name}
                  </Link>
                  <AttendanceTag status={m.status} label={t(`status_${m.status}`)} time={m.checked_in_at ? time(m.checked_in_at) : null} />
                </li>
              ))}
            </ul>
          ) : (
            <p className={hintClass}>{t("noMembers")}</p>
          )}
        </div>
      ) : (
        <p className="rounded-md border border-dashed border-border px-4 py-3 text-sm text-fg-muted" data-testid="attendance-none">
          {t("none")}
        </p>
      )}

      <div className="border-t border-border pt-4">
        <AttendanceImport eventId={eventId} />
      </div>
    </section>
  );
}
