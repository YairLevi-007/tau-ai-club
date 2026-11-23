"use client";

import { useState } from "react";
import { ClipboardCopy } from "lucide-react";
import { hintClass, inputClass, smallBtn, cn } from "@/components/pair/site-ui";

/** pAIr's "copy for WhatsApp": copies the list; if the browser refuses, shows it to copy by hand. */
export function CopyTextButton({ text, labels }: { text: string; labels: { copy: string; copied: string; manual: string } }) {
  const [state, setState] = useState<"idle" | "copied" | "manual">("idle");
  return (
    <div className="grid gap-2">
      <button
        type="button"
        className={smallBtn}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setState("copied");
          } catch {
            setState("manual");
          }
        }}
      >
        <ClipboardCopy aria-hidden />
        {state === "copied" ? labels.copied : labels.copy}
      </button>
      <span className="sr-only" role="status">
        {state === "copied" ? labels.copied : ""}
      </span>
      {state === "manual" && (
        <>
          <p className={hintClass}>{labels.manual}</p>
          <textarea readOnly value={text} rows={6} className={cn(inputClass, "h-auto py-2 font-mono text-sm")} onFocus={(e) => e.currentTarget.select()} />
        </>
      )}
    </div>
  );
}
