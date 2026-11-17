"use client";

import { useTranslations } from "next-intl";
import { FileText } from "lucide-react";
import { ActionForm } from "@/components/admin/action-form";
import { dangerBtn, fileInputClass, hintClass, inputClass, labelClass, panelClass, panelTitle, smallBtn } from "@/components/admin/styles";
import { deleteEventFile, setFileStatus, uploadEventFile } from "@/app/[locale]/admin/content/actions";
import type { EventFile } from "@/lib/content/sections";
import { cn } from "@/lib/utils";

/** The event's PDFs in the private bucket: upload, publish/unpublish, delete. */
export function FilesPanel({ eventId, files }: { eventId: string; files: Required<EventFile>[] }) {
  const t = useTranslations("content");
  return (
    <section aria-labelledby="files-title" className={cn(panelClass, "grid gap-4 p-5 sm:p-6")} data-testid="files-panel">
      <div className="grid gap-1">
        <h2 id="files-title" className={panelTitle}>
          {t("filesTitle")}
        </h2>
        <p className={hintClass}>{t("filesBody")}</p>
      </div>

      {files.length === 0 ? (
        <p className="text-sm text-fg-subtle">{t("fileNone")}</p>
      ) : (
        <ul className="grid gap-2">
          {files.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3">
              <span className="flex min-w-0 items-center gap-2">
                <FileText aria-hidden className="size-4 shrink-0 text-brand-purple-soft" />
                <span className="grid min-w-0">
                  <span className="truncate text-fg">{f.title_he}</span>
                  <bdi dir="ltr" className="truncate font-mono text-xs text-fg-subtle">
                    {f.path}
                  </bdi>
                </span>
                <Tag tone={f.status === "published" ? "next" : "neutral"}>{t(f.status === "published" ? "statusPublished" : "statusDraft")}</Tag>
              </span>
              <span className="flex flex-wrap gap-2">
                <ActionForm action={setFileStatus}>
                  <input type="hidden" name="id" value={f.id} />
                  <input type="hidden" name="event_id" value={eventId} />
                  <input type="hidden" name="status" value={f.status === "published" ? "draft" : "published"} />
                  <button type="submit" className={smallBtn}>
                    {t(f.status === "published" ? "fileUnpublish" : "filePublish")}
                  </button>
                </ActionForm>
                <ActionForm action={deleteEventFile} confirmText={t("fileDeleteConfirm")}>
                  <input type="hidden" name="id" value={f.id} />
                  <input type="hidden" name="event_id" value={eventId} />
                  <button type="submit" className={dangerBtn}>
                    {t("fileDelete")}
                  </button>
                </ActionForm>
              </span>
            </li>
          ))}
        </ul>
      )}

      <ActionForm action={uploadEventFile} resetOnSuccess className="grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
        <input type="hidden" name="event_id" value={eventId} />
        <label className={labelClass}>
          {t("fileTitleHe")}
          <input name="title_he" dir="rtl" maxLength={200} className={inputClass} />
        </label>
        <label className={labelClass}>
          {t("fileTitleEn")}
          <input name="title_en" dir="ltr" maxLength={200} className={inputClass} />
        </label>
        <label className={cn(labelClass, "sm:col-span-2")}>
          {t("fileChoose")}
          <input type="file" name="file" accept="application/pdf,.pdf" required className={fileInputClass} />
        </label>
        <button type="submit" className="btn btn-primary h-10 w-fit px-4 text-sm">
          {t("fileUpload")}
        </button>
      </ActionForm>
    </section>
  );
}

/** Status tag (same look as the public tags; event-bits is server-only). */
function Tag({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "next" | "neutral" }) {
  return <span className={cn("tag", tone === "next" && "tag-next")}>{children}</span>;
}
