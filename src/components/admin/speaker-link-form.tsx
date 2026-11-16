"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { ActionForm, type FormAction } from "./action-form";
import { inputClass, labelClass, smallBtn } from "./styles";

/** Creates a single-use speaker link and shows it once, with a copy button. */
export function SpeakerLinkForm({
  action,
  speakerId,
  labels,
}: {
  action: FormAction;
  speakerId: string;
  labels: { create: string; days: string; copy: string; copied: string; link: string };
}) {
  const [copied, setCopied] = useState(false);
  return (
    <ActionForm
      action={action}
      className="flex flex-wrap items-end gap-2"
      render={(state) =>
        state?.ok && state.link ? (
          <div className="flex basis-full flex-wrap items-center gap-2">
            <input
              readOnly
              value={state.link}
              dir="ltr"
              aria-label={labels.link}
              onFocus={(e) => e.currentTarget.select()}
              className={`${inputClass} grow font-mono text-sm`}
            />
            <button
              type="button"
              className={smallBtn}
              onClick={async () => {
                await navigator.clipboard.writeText(state.link!);
                setCopied(true);
              }}
            >
              {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
              <span aria-live="polite">{copied ? labels.copied : labels.copy}</span>
            </button>
          </div>
        ) : null
      }
    >
      <input type="hidden" name="speaker_id" value={speakerId} />
      <label className={labelClass}>
        {labels.days}
        <input name="days" type="number" min={1} max={60} defaultValue={14} className={`${inputClass} w-24`} />
      </label>
      <button type="submit" className={smallBtn} onClick={() => setCopied(false)}>
        {labels.create}
      </button>
    </ActionForm>
  );
}
