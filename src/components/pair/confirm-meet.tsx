"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { confirmMyPair } from "@/app/[locale]/me/pair-actions";
import { smallBtn } from "@/components/admin/styles";
import { TIME_ZONE, type Locale } from "@/i18n/routing";
import { cn } from "@/lib/utils";

/**
 * pAIr's "✓ the meeting happened" bar. After pressing: "you confirmed" + the time + undo.
 * `compact` is the one-line version for earlier meetups.
 */
export function ConfirmMeet({
  roundId,
  locale,
  confirmedAt,
  compact = false,
  labels,
  timeLabel,
}: {
  roundId: string;
  locale: Locale;
  confirmedAt: string | null;
  compact?: boolean;
  labels: { confirm: string; confirmed: string; undo: string; hint: string; thanks: string; failed: string; done: string };
  /** Pre-formatted confirmation time (Israel time), when there is one. */
  timeLabel: string | null;
}) {
  const [at, setAt] = useState(confirmedAt);
  const [shownTime, setShownTime] = useState(timeLabel);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const run = (on: boolean) =>
    start(async () => {
      const res = await confirmMyPair(roundId, on);
      if (!res.ok) {
        setMsg(labels.failed);
        return;
      }
      setAt(res.at);
      setShownTime(res.at ? new Intl.DateTimeFormat(locale, { timeZone: TIME_ZONE, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(res.at)) : null);
      setMsg(on ? labels.thanks : "");
    });

  if (compact) {
    return at ? (
      <span className="inline-flex items-center gap-1.5 text-sm text-brand-purple-soft">
        <Check aria-hidden className="size-4" />
        {labels.done}
      </span>
    ) : (
      <button type="button" className={cn(smallBtn, "h-9")} disabled={pending} onClick={() => run(true)}>
        <Check aria-hidden />
        {labels.confirm}
      </button>
    );
  }

  return (
    <div className="grid gap-1.5" data-testid="pair-confirm">
      {at ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-border-accent bg-brand-purple/10 px-3.5 py-2.5">
          <span className="inline-flex items-center gap-1.5 font-semibold text-fg">
            <Check aria-hidden className="size-4 text-brand-purple-soft" />
            {labels.confirmed}
          </span>
          {shownTime && (
            <bdi dir="ltr" className="font-mono text-xs text-fg-subtle">
              {shownTime}
            </bdi>
          )}
          <button type="button" className={cn(smallBtn, "ms-auto h-9")} disabled={pending} onClick={() => run(false)}>
            {labels.undo}
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <button type="button" className="btn btn-primary h-11 px-4" disabled={pending} onClick={() => run(true)}>
            <Check aria-hidden />
            {labels.confirm}
          </button>
          <span className="text-sm text-fg-subtle">{labels.hint}</span>
        </div>
      )}
      <p role="status" className="text-sm text-fg-muted">
        {msg}
      </p>
    </div>
  );
}
