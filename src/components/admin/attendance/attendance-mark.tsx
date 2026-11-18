import { cn } from "@/lib/utils";
import type { AttendanceStatus } from "@/lib/attendance/data";

/**
 * Attendance in the site's pixel language (the same squares as the season dial):
 * filled purple = checked in, hollow = registered or didn't come, a dash = no Luma data yet.
 * Shape carries the state as well as color; callers always add the state as text too.
 */
export function AttendanceMark({ status, className }: { status: AttendanceStatus | "none" | "nodata"; className?: string }) {
  if (status === "nodata") return <span aria-hidden className={cn("block h-0.5 w-2.5 rounded-full bg-fg-faint", className)} />;
  return (
    <span
      aria-hidden
      className={cn(
        "block size-2.5 shrink-0 border-2",
        status === "checked_in" && "border-brand-purple bg-brand-purple",
        status === "registered" && "border-dashed border-brand-purple-soft",
        status === "no_show" && "border-fg-subtle",
        status === "none" && "border-fg-faint",
        className,
      )}
    />
  );
}

/** A status pill: the mark plus its label (and the check-in time when there is one). */
export function AttendanceTag({ status, label, time }: { status: AttendanceStatus; label: string; time?: string | null }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        status === "checked_in" ? "border-border-accent bg-brand-purple-deeper/45 text-brand-purple-softer" : "border-border text-fg-subtle",
      )}
    >
      <AttendanceMark status={status} className="size-2" />
      {label}
      {time && (
        <bdi dir="ltr" className="font-mono text-[0.6875rem] text-fg-muted">
          {time}
        </bdi>
      )}
    </span>
  );
}

/** Attendance rate as a number and a thin bar (the number is the text; the bar only echoes it). */
export function RateBar({ rate, className }: { rate: number | null; className?: string }) {
  const pct = rate === null ? null : Math.round(rate * 100);
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span aria-hidden className="hidden h-1 w-12 overflow-hidden rounded-full bg-border sm:block">
        {pct !== null && <span className="block h-full rounded-full bg-brand-purple-soft" style={{ width: `${pct}%` }} />}
      </span>
      <bdi className="w-9 text-end font-mono text-[0.8125rem] text-fg-muted tabular-nums">{pct === null ? "–" : `${pct}%`}</bdi>
    </span>
  );
}
