import { getLocale, getTranslations } from "next-intl/server";
import { CircleCheck, CircleDashed, Clock } from "lucide-react";
import type { Locale } from "@/i18n/routing";
import { TIME_ZONE } from "@/i18n/routing";
import type { UploadPhase } from "@/lib/attendance/data";
import { formatShortDate } from "@/lib/event-format";
import { cn } from "@/lib/utils";

const hhmm = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

/**
 * A session's two Luma uploads (DECISIONS 25.11): "Before: who registered" and "After: who came",
 * each with when it was done, or what it's waiting for. Status is in words as well as the icon.
 */
export async function UploadSteps({
  before,
  after,
  phase,
  endsAt,
  className,
}: {
  before: string | null;
  after: string | null;
  phase: UploadPhase;
  endsAt: string;
  className?: string;
}) {
  const [t, locale] = await Promise.all([getTranslations("attendance"), getLocale() as Promise<Locale>]);
  const when = (iso: string) => ({ date: formatShortDate(iso, locale), time: hhmm(iso) });

  const steps = [
    {
      key: "before" as const,
      label: t("stepBefore"),
      done: before,
      // Before is open until the session ends; after that it can only be "missed".
      waiting: phase === "before" ? t("stepNotYet") : t("stepMissed"),
      state: before ? "done" : phase === "before" ? "open" : "missed",
    },
    {
      key: "after" as const,
      label: t("stepAfter"),
      done: after,
      waiting: phase === "after" ? t("stepNotYet") : t("stepOpensAfter"),
      state: after ? "done" : phase === "after" ? "open" : "later",
    },
  ];

  return (
    <ol className={cn("grid gap-2 sm:grid-cols-2", className)} data-testid="upload-steps">
      {steps.map((s) => {
        const Icon = s.done ? CircleCheck : s.state === "later" ? Clock : CircleDashed;
        return (
          <li
            key={s.key}
            className={cn(
              "flex items-start gap-2.5 rounded-md border px-3 py-2.5 text-sm",
              s.done ? "border-border-accent/70 bg-brand-purple-deeper/25" : s.state === "open" ? "border-border-accent/40 bg-bg-deep/40" : "border-border bg-bg-deep/40",
            )}
            data-testid={`upload-${s.key}`}
            data-state={s.state}
          >
            <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", s.done ? "text-brand-purple-soft" : "text-fg-subtle")} />
            <span className="grid gap-0.5">
              <span className="font-medium text-fg">{s.label}</span>
              <span className={s.done ? "text-fg-muted" : s.state === "missed" ? "text-fg-muted" : "text-fg-subtle"}>
                {s.done ? (
                  <>
                    {t("stepDone")} <bdi dir="ltr" className="font-mono text-[0.8125rem]">{`${when(s.done).date} ${when(s.done).time}`}</bdi>
                  </>
                ) : s.state === "later" ? (
                  <>
                    {s.waiting} <bdi dir="ltr" className="font-mono text-[0.8125rem]">{`${when(endsAt).date} ${when(endsAt).time}`}</bdi>
                  </>
                ) : (
                  s.waiting
                )}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
