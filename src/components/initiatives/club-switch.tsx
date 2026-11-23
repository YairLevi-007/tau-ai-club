"use client";

import { useState } from "react";
import Image from "next/image";
import { Check } from "lucide-react";
import { hintClass, inputClass, labelClass } from "@/components/admin/styles";
import { cn } from "@/lib/utils";

/**
 * The admin's "זו יוזמה של המועדון" switch and the approve button (design/initiatives kinds.png,
 * k-admin-approve). It starts from what the member asked for; the admin has the final say. A real
 * checkbox (role="switch"), so it works with the keyboard and without JS (the button's label then
 * stays on the starting choice; the form still sends the switch's state).
 */
export function ClubSwitch({
  startOn,
  labels,
}: {
  startOn: boolean;
  labels: { switchLabel: string; onHint: string; offHint: string; reason: string; approve: string; approveClub: string; badge: string };
}) {
  const [on, setOn] = useState(startOn);
  return (
    <div className="grid gap-3">
      <label
        className={cn(
          "flex cursor-pointer items-start justify-between gap-4 rounded-lg border px-4 py-3 transition-colors",
          on ? "border-brand-purple/70 bg-brand-purple/10" : "border-border bg-bg-deep/40",
        )}
      >
        <span className="grid gap-1">
          <span className="flex flex-wrap items-center gap-2 font-semibold text-fg">
            {on && (
              <span className="tag gap-1.5 border-brand-purple font-semibold text-fg">
                <Image src="/brand/logo-mark.png" alt="" width={520} height={322} className="h-3 w-auto [image-rendering:pixelated]" />
                {labels.badge}
              </span>
            )}
            {labels.switchLabel}
          </span>
          <span className={hintClass}>{on ? labels.onHint : labels.offHint}</span>
        </span>
        <input
          type="checkbox"
          role="switch"
          name="make_club"
          defaultChecked={startOn}
          onChange={(e) => setOn(e.target.checked)}
          className="peer sr-only"
          data-testid="club-switch"
        />
        <span
          aria-hidden
          className={cn(
            "relative mt-0.5 h-6 w-11 shrink-0 rounded-full border transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-purple",
            on ? "border-brand-purple bg-brand-purple" : "border-border-strong bg-bg-deep",
          )}
        >
          <span className={cn("absolute top-0.5 size-4.5 rounded-full bg-fg transition-[inset-inline-start]", on ? "start-[1.375rem]" : "start-0.5")} />
        </span>
      </label>
      {on && (
        <label className={labelClass}>
          {labels.reason}
          <textarea name="club_reason" rows={2} maxLength={500} className={cn(inputClass, "h-auto py-2 leading-relaxed")} />
        </label>
      )}
      <button type="submit" name="decision" value="publish" className="btn btn-primary h-11 w-full px-5 sm:w-fit" data-testid="approve">
        <Check aria-hidden className="size-4" />
        {on ? labels.approveClub : labels.approve}
      </button>
    </div>
  );
}
