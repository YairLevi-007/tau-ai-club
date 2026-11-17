"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { FileSpreadsheet, LoaderCircle } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { readLumaCsv, type AttendanceRow, type LumaCsv } from "@/lib/attendance/luma-csv";
import { importAttendance, type AttendanceResult } from "@/app/[locale]/admin/events/attendance-actions";
import { fileInputClass, hintClass, labelClass, smallBtn } from "@/components/admin/styles";
import { AttendanceTag } from "./attendance-mark";

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * "Attendance from Luma": the admin picks Luma's guest export; it's read here in the browser,
 * matched against the member list on the server (preview), and saved only when they confirm.
 * Only email + going + check-in time leave the browser. Re-importing replaces the event's data.
 */
export function AttendanceImport({ eventId }: { eventId: string }) {
  const t = useTranslations("attendance");
  const router = useRouter();
  const [csv, setCsv] = useState<LumaCsv | null>(null);
  const [preview, setPreview] = useState<AttendanceResult | null>(null);
  const [busy, setBusy] = useState<null | "reading" | "saving">(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function run(rows: AttendanceRow[], commit: boolean) {
    const res = await importAttendance(eventId, rows, commit);
    if (!res.ok) throw new Error(res.error);
    return res.result;
  }

  async function onPick(file: File | null) {
    setError(null);
    setPreview(null);
    setCsv(null);
    setSaved(false);
    if (!file) return;
    if (file.size > MAX_BYTES) return setError(t("errorSize"));
    setBusy("reading");
    try {
      const parsed = readLumaCsv(await file.text());
      if (parsed.error) return setError(t(parsed.error === "no_email" ? "errorNoEmail" : "errorEmpty"));
      setCsv(parsed);
      setPreview(await run(parsed.rows, false));
    } catch {
      setError(t("errorFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function onSave() {
    if (!csv) return;
    setBusy("saving");
    setError(null);
    try {
      await run(csv.rows, true);
      setSaved(true);
      setPreview(null);
      setCsv(null);
      router.refresh();
    } catch {
      setError(t("errorFailed"));
    } finally {
      setBusy(null);
    }
  }

  const count = (s: string) => preview?.members.filter((m) => m.status === s).length ?? 0;

  return (
    <div className="grid gap-3" data-testid="attendance-import">
      <label className={labelClass}>
        {t("pick")}
        <input type="file" accept=".csv,text/csv" className={fileInputClass} onChange={(e) => onPick(e.target.files?.[0] ?? null)} data-testid="attendance-file" />
      </label>
      <p className={hintClass}>{t("pickHint")}</p>
      <p role="status" aria-live="polite" className="text-sm text-fg-muted">
        {busy === "reading" ? t("reading") : busy === "saving" ? t("saving") : saved ? t("saved") : ""}
      </p>
      {error && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" data-testid="attendance-error">
          {error}
        </p>
      )}

      {preview && csv && (
        <div className="grid gap-3 rounded-lg border border-border-accent/70 bg-bg-deep/35 p-4" data-testid="attendance-preview">
          <p className="text-sm font-semibold text-fg">{t("previewTitle")}</p>
          <ul className="grid gap-1 text-sm text-fg-muted marker:text-brand-purple-soft">
            <li data-testid="preview-checked-in">{t("countCheckedIn", { n: count("checked_in") })}</li>
            <li data-testid="preview-no-show">{t("countNoShow", { n: count("no_show") })}</li>
            <li data-testid="preview-registered">{t("countRegistered", { n: count("registered") })}</li>
            <li data-testid="preview-guests">{t("countGuests", { n: preview.guests_registered, in: preview.guests_checked_in })}</li>
            <li>{t("countIgnored", { n: preview.ignored, total: preview.rows_total })}</li>
          </ul>
          {preview.members.length > 0 && (
            <ul className="grid gap-1.5 border-t border-border pt-3 text-sm" aria-label={t("matchedMembers")} data-testid="preview-members">
              {preview.members.map((m) => (
                <li key={m.member_id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-medium text-fg">{m.full_name}</span>
                  <AttendanceTag status={m.status} label={t(`status_${m.status}`)} />
                </li>
              ))}
            </ul>
          )}
          <details className="text-xs text-fg-subtle">
            <summary className="cursor-pointer">{t("columnsTitle")}</summary>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1" data-testid="preview-columns">
              {(["email", "status", "checkin"] as const).map((k) => (
                <div key={k} className="contents">
                  <dt>{t(`column_${k}`)}</dt>
                  <dd>
                    <bdi dir="ltr" className="font-mono">{csv.columns[k] || t("columnMissing")}</bdi>
                  </dd>
                </div>
              ))}
              <dt>{t("columnStatuses")}</dt>
              <dd>
                <bdi dir="ltr" className="font-mono">
                  {Object.entries(csv.statuses)
                    .map(([s, n]) => `${s}: ${n}`)
                    .join(", ") || "—"}
                </bdi>
              </dd>
            </dl>
          </details>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn btn-primary h-10 px-4 text-sm" disabled={!!busy} onClick={onSave} data-testid="attendance-save">
              {busy === "saving" ? <LoaderCircle aria-hidden className="animate-spin motion-reduce:animate-none" /> : <FileSpreadsheet aria-hidden />}
              {t("save")}
            </button>
            <button type="button" className={smallBtn} disabled={!!busy} onClick={() => (setPreview(null), setCsv(null))}>
              {t("discard")}
            </button>
            <p className={hintClass}>{t("saveHint")}</p>
          </div>
        </div>
      )}
    </div>
  );
}
