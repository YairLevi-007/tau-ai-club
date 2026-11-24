import { getLocale, getTranslations } from "next-intl/server";
import { Upload } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import type { SessionUploads } from "@/lib/attendance/data";
import { formatShortDate, loc } from "@/lib/event-format";
import { BidiText } from "@/components/events/bidi-text";
import { hintClass, panelClass, panelTitle, smallBtn } from "@/components/admin/styles";
import { cn } from "@/lib/utils";
import { AttendanceImport } from "./attendance-import";
import { UploadSteps } from "./upload-steps";

/**
 * "Uploads per session" on the admin attendance page (DECISIONS 25.11): for the next session and
 * every past one (newest first), the two Luma uploads, "before: who registered" and "after: who
 * came", with when each was done, and the upload for the one it's waiting for now. The upload
 * is the same import as on the event's page; only its label says which of the two it is.
 */
export async function SessionUploadsList({ sessions }: { sessions: SessionUploads[] }) {
  const [t, locale] = await Promise.all([getTranslations("attendance"), getLocale() as Promise<Locale>]);
  const next = sessions.filter((s) => s.next);
  const past = sessions.filter((s) => s.phase === "after").reverse();
  const shown = [...next, ...past];

  return (
    <section id="uploads" aria-labelledby="uploads-heading" className="grid scroll-mt-24 gap-3" data-testid="attendance-uploads">
      <div className="grid gap-1">
        <h2 id="uploads-heading" className={panelTitle}>
          {t("uploadsTitle")}
        </h2>
        <p className={cn(hintClass, "max-w-[70ch]")}>{t("uploadsBody")}</p>
      </div>
      {shown.length === 0 ? (
        <p className="text-fg-muted">{t("uploadsEmpty")}</p>
      ) : (
        <ul className="grid gap-3">
          {shown.map((s) => (
            <li
              key={s.event.id}
              className={cn(panelClass, "grid gap-3 p-4 sm:p-5", !s.next && "border-border")}
              data-testid="session-uploads"
              data-event={s.event.slug}
              data-phase={s.phase}
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <bdi dir="ltr" className="font-mono text-sm text-fg-muted">
                  {formatShortDate(s.event.starts_at, locale)}
                </bdi>
                <Link href={`/admin/events/${s.event.id}`} className="min-w-0 font-semibold text-fg underline-offset-4 hover:underline">
                  <BidiText text={loc(s.event, "title", locale) ?? s.event.slug} />
                </Link>
                {s.next ? (
                  <span className="rounded-full border border-border-accent px-2.5 py-0.5 text-xs text-brand-purple-soft">{t("nextSession")}</span>
                ) : (
                  <span className="rounded-full border border-border px-2.5 py-0.5 text-xs text-fg-subtle">{t("sessionPast")}</span>
                )}
              </div>
              <UploadSteps before={s.before} after={s.after} phase={s.phase} endsAt={s.event.ends_at} />
              <details className="group" data-testid="upload-details">
                <summary className={cn(smallBtn, "w-fit cursor-pointer list-none [&::-webkit-details-marker]:hidden")} data-testid="upload-open">
                  <Upload aria-hidden />
                  {s.phase === "before" ? t("uploadBefore") : t("uploadAfter")}
                </summary>
                <div className="mt-3 border-t border-border pt-3">
                  <AttendanceImport eventId={s.event.id} phase={s.phase} />
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
