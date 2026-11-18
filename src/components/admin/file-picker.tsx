"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Paperclip } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A file input in the page's language. The browser's own picker always says "Choose File /
 * No file chosen" in the browser's language, so the real <input type="file"> sits invisibly
 * over a styled button (still the click and keyboard target, still named by the surrounding
 * <label>, still in the form), and the chosen file's name is written next to it.
 * Without JS it still opens the picker and submits; only the name preview needs JS.
 */
export function FilePicker({
  name,
  accept,
  required,
  onChange,
  className,
  "data-testid": testId,
}: {
  name?: string;
  accept?: string;
  required?: boolean;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  className?: string;
  "data-testid"?: string;
}) {
  const t = useTranslations("filePicker");
  const ref = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  // A form reset (e.g. after a successful upload) clears the input; clear the name with it.
  useEffect(() => {
    const form = ref.current?.form;
    if (!form) return;
    const onReset = () => setFileName(null);
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, []);

  return (
    <span className={cn("flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 font-normal", className)}>
      <span className="relative inline-flex shrink-0">
        <input
          ref={ref}
          type="file"
          name={name}
          accept={accept}
          required={required}
          data-testid={testId}
          onChange={(e) => {
            setFileName(e.target.files?.[0]?.name ?? null);
            onChange?.(e);
          }}
          className="peer absolute inset-0 z-10 size-full cursor-pointer opacity-0"
        />
        <span
          aria-hidden
          className="btn btn-ghost h-10 px-3.5 text-sm peer-hover:border-border-strong peer-hover:bg-surface-hover peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-purple"
        >
          <Paperclip />
          {fileName ? t("change") : t("choose")}
        </span>
      </span>
      {/* The input itself announces the chosen file to screen readers; this is the visible copy. */}
      <span aria-hidden className={cn("min-w-0 truncate text-sm", fileName ? "text-fg" : "text-fg-subtle")}>
        {fileName ? <bdi>{fileName}</bdi> : t("none")}
      </span>
    </span>
  );
}
