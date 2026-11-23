"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { confirmMyPair } from "@/lib/pair/me-actions";
import { smallBtn, TIME_ZONE, type Locale, cn } from "@/components/pair/site-ui";
import { confirmedAfter } from "@/lib/pair/confirm-state";

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
      const next = confirmedAfter(on, res.at);
      setAt(next);
      setShownTime(next ? new Intl.DateTimeFormat(locale, { timeZone: TIME_ZONE, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(next)) : null);
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
        // Once confirmed, the big button gives way to one quiet line (DECISIONS 23.11).
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm" data-testid="pair-confirmed">
          <span className="inline-flex items-center gap-1.5 font-medium text-brand-purple-soft">
            <Check aria-hidden className="size-4" />
            {labels.confirmed}
          </span>
          {shownTime && (
            <bdi dir="ltr" className="font-mono text-xs text-fg-subtle">
              {shownTime}
            </bdi>
          )}
          <button
            type="button"
            className="inline-flex min-h-11 items-center px-1 text-fg-muted underline underline-offset-4 hover:text-fg disabled:opacity-60"
            disabled={pending}
            onClick={() => run(false)}
            data-testid="pair-undo"
          >
            {labels.undo}
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <button type="button" className="btn btn-primary h-11 px-4" disabled={pending} aria-busy={pending} onClick={() => run(true)}>
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
