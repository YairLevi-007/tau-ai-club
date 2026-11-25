"use client";

import { useTranslations } from "next-intl";
import { RotateCw } from "lucide-react";
import { smallBtn } from "@/components/admin/styles";
import { cn } from "@/lib/utils";

export { hasFile, isStalePage } from "@/lib/stale-action";

/**
 * "This page is out of date: refresh and try again", with a refresh button. `file`: the admin
 * had chosen a file, which the reload clears, so it also says to choose it again.
 */
export function StalePageNotice({ file = false, className }: { file?: boolean; className?: string }) {
  const t = useTranslations("stalePage");
  return (
    <div
      role="alert"
      className={cn("grid gap-2.5 rounded-md border border-destructive/50 bg-destructive/10 px-3.5 py-3 text-sm text-fg", className)}
      data-testid="stale-page"
      data-file={file || undefined}
    >
      <p className="max-w-[65ch]">
        <span className="font-semibold">{t("title")}</span> {file ? t("bodyFile") : t("body")}
      </p>
      <button type="button" className={cn(smallBtn, "w-fit")} onClick={() => window.location.reload()} data-testid="stale-page-refresh">
        <RotateCw aria-hidden />
        {t("refresh")}
      </button>
    </div>
  );
}
