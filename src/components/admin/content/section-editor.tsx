"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Eye, PencilLine } from "lucide-react";
import { ActionForm } from "@/components/admin/action-form";
import { hintClass, inputClass, labelClass, panelClass, smallBtn } from "@/components/admin/styles";
import { MarkdownBody } from "@/components/content/markdown-body";
import { saveSection } from "@/app/[locale]/admin/content/actions";
import type { ContentRow, ContentSection } from "@/lib/content/sections";
import { cn } from "@/lib/utils";

const areaClass = cn(inputClass, "h-auto min-h-48 w-full resize-y py-2.5 font-mono text-[0.875rem] leading-relaxed");

/**
 * One section of an event: Markdown in Hebrew (the source) and English, a live preview
 * through the same safe renderer the site uses, the audience, and draft/published.
 */
export function SectionEditor({ eventId, section, row }: { eventId: string; section: ContentSection; row: ContentRow | null }) {
  const t = useTranslations("content");
  const [he, setHe] = useState(row?.body_he ?? "");
  const [en, setEn] = useState(row?.body_en ?? "");
  const [preview, setPreview] = useState(false);
  const id = `sec-${section}`;

  return (
    <section aria-labelledby={`${id}-title`} className={cn(panelClass, "grid gap-4 p-5 sm:p-6")} data-testid={`editor-${section}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id={`${id}-title`} className="text-lg font-bold text-fg">
            {t(`section_${section}`)}
          </h2>
          {row ? (
            <>
              <Tag tone={row.status === "published" ? "next" : "neutral"}>{t(row.status === "published" ? "statusPublished" : "statusDraft")}</Tag>
              <Tag>{t(row.visibility === "public" ? "visibilityPublic" : "visibilityMembers")}</Tag>
            </>
          ) : (
            <span className="text-sm text-fg-subtle">{t("notSaved")}</span>
          )}
        </div>
        <button type="button" className={smallBtn} aria-pressed={preview} onClick={() => setPreview((p) => !p)} data-testid="toggle-preview">
          {preview ? <PencilLine aria-hidden /> : <Eye aria-hidden />}
          {preview ? t("write") : t("preview")}
        </button>
      </div>

      <ActionForm action={saveSection} className="grid gap-4">
        <input type="hidden" name="event_id" value={eventId} />
        <input type="hidden" name="section" value={section} />

        <div className="grid gap-4 lg:grid-cols-2">
          <div className={labelClass}>
            <label htmlFor={`${id}-he`}>{t("editorHe")}</label>
            <textarea
              id={`${id}-he`}
              name="body_he"
              dir="rtl"
              lang="he"
              value={he}
              onChange={(e) => setHe(e.target.value)}
              className={cn(areaClass, preview && "hidden")}
              data-testid="body-he"
            />
            {preview && (
              <div className="min-h-48 rounded-md border border-border bg-bg-deep/40 p-4" data-testid="preview-he">
                {he.trim() ? <MarkdownBody source={he} lang="he" /> : <p className="text-sm text-fg-subtle">{t("previewEmpty")}</p>}
              </div>
            )}
          </div>
          <div className={labelClass}>
            <label htmlFor={`${id}-en`}>{t("editorEn")}</label>
            <textarea
              id={`${id}-en`}
              name="body_en"
              dir="ltr"
              lang="en"
              value={en}
              onChange={(e) => setEn(e.target.value)}
              aria-describedby={`${id}-en-hint`}
              className={cn(areaClass, preview && "hidden")}
              data-testid="body-en"
            />
            {preview && (
              <div className="min-h-48 rounded-md border border-border bg-bg-deep/40 p-4" data-testid="preview-en">
                {en.trim() ? <MarkdownBody source={en} lang="en" /> : <p className="text-sm text-fg-subtle">{t("hebrewOnly")}</p>}
              </div>
            )}
            <p id={`${id}-en-hint`} className={hintClass}>
              {t("editorEnHint")}
            </p>
          </div>
        </div>
        <p className={hintClass}>{t("markdownHint")}</p>

        <div className="flex flex-wrap items-end gap-4">
          <label className={labelClass}>
            {t("visibility")}
            <select name="visibility" defaultValue={row?.visibility ?? (section === "blurb" ? "public" : "members")} className={inputClass} data-testid="visibility">
              <option value="members">{t("visibilityMembers")}</option>
              <option value="public">{t("visibilityPublic")}</option>
            </select>
          </label>
          <label className={labelClass}>
            {t("status")}
            <select name="status" defaultValue={row?.status ?? "draft"} className={inputClass} data-testid="status">
              <option value="draft">{t("statusDraft")}</option>
              <option value="published">{t("statusPublished")}</option>
            </select>
          </label>
          <button type="submit" className="btn btn-primary h-10 px-4 text-sm" data-testid="save-section">
            {t("save")}
          </button>
        </div>
      </ActionForm>
    </section>
  );
}

/** Status tag (same look as the public tags; event-bits is server-only). */
function Tag({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "next" | "neutral" }) {
  return <span className={cn("tag", tone === "next" && "tag-next")}>{children}</span>;
}
