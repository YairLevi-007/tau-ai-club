"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { FileSpreadsheet, LoaderCircle } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { readLumaCsv, type AttendanceRow, type LumaCsv } from "@/lib/attendance/luma-csv";
import { readLumaPdfLines, textItemsToLines } from "@/lib/attendance/luma-pdf";
import { importAttendance, type AttendanceResult } from "@/app/[locale]/admin/events/attendance-actions";
import { hintClass, labelClass, smallBtn } from "@/components/admin/styles";
import { FilePicker } from "@/components/admin/file-picker";
import { StalePageNotice, isStalePage } from "@/components/admin/stale-page";
import { AttendanceTag } from "./attendance-mark";

const MAX_BYTES = 5 * 1024 * 1024;

/** What was read from the file: the CSV's shape, plus the PDF's title and rows it couldn't read. */
type Parsed = Omit<LumaCsv, "error"> & { title?: string; unreadable?: number };

const isPdf = (file: File) => file.type === "application/pdf" || /\.pdf$/i.test(file.name);

/**
 * Luma's attendee PDF (24.11), read here like the CSV: text only, with pdf.js in a worker. Returns
 * null when it isn't a readable Luma attendee PDF. Only email + going + checked in come out.
 */
async function readPdf(file: File): Promise<Parsed | null> {
  const bytes = await file.arrayBuffer();
  if (new TextDecoder().decode(new Uint8Array(bytes, 0, Math.min(5, bytes.byteLength))) !== "%PDF-") return null;
  const { pdfTextItems } = await import("@/lib/attendance/pdf-text");
  const parsed = readLumaPdfLines(textItemsToLines(await pdfTextItems(bytes)));
  return parsed.error || !parsed.rows.length ? null : parsed;
}

/**
 * "Attendance from Luma": the admin picks Luma's guest export; it's read here in the browser,
 * matched against the member list on the server (preview), and saved only when they confirm.
 * Only email + going + check-in time leave the browser. Re-importing replaces the event's data.
 */
export function AttendanceImport({ eventId, phase }: { eventId: string; /** Which of the session's two uploads this is (25.11); only the label changes. */ phase?: "before" | "after" }) {
  const t = useTranslations("attendance");
  const router = useRouter();
  const [csv, setCsv] = useState<Parsed | null>(null);
  const [preview, setPreview] = useState<AttendanceResult | null>(null);
  const [busy, setBusy] = useState<null | "reading" | "saving">(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // The page is from an older deployment (25.11, session 3): only a reload helps, then the file again.
  const [stale, setStale] = useState(false);

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
    setStale(false);
    if (!file) return;
    if (file.size > MAX_BYTES) return setError(t("errorSize"));
    setBusy("reading");
    try {
      let parsed: Parsed;
      if (isPdf(file)) {
        const pdf = await readPdf(file).catch(() => null);
        if (!pdf) return setError(t("errorPdf"));
        parsed = pdf;
      } else {
        const fromCsv = readLumaCsv(await file.text());
        if (fromCsv.error) return setError(t(fromCsv.error === "no_email" ? "errorNoEmail" : "errorEmpty"));
        parsed = fromCsv;
      }
      setCsv(parsed);
      setPreview(await run(parsed.rows, false));
    } catch (e) {
      if (isStalePage(e)) {
        setCsv(null);
        return setStale(true);
      }
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
    } catch (e) {
      if (isStalePage(e)) {
        setPreview(null);
        setCsv(null);
        return setStale(true);
      }
      setError(t("errorFailed"));
    } finally {
      setBusy(null);
    }
  }

  const count = (s: string) => preview?.members.filter((m) => m.status === s).length ?? 0;

  return (
    <div className="grid gap-3" data-testid="attendance-import" data-phase={phase}>
      <label className={labelClass}>
        {phase === "before" ? t("pickBefore") : phase === "after" ? t("pickAfter") : t("pick")}
        <FilePicker accept=".csv,text/csv,.pdf,application/pdf" onChange={(e) => onPick(e.target.files?.[0] ?? null)} data-testid="attendance-file" />
      </label>
      <p className={hintClass}>{t("pickHint")}</p>
      <p role="status" aria-live="polite" className="text-sm text-fg-muted">
        {busy === "reading" ? t("reading") : busy === "saving" ? t("saving") : saved ? t("saved") : ""}
      </p>
      {stale && <StalePageNotice file />}
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
            {!!csv.unreadable && <li data-testid="preview-unreadable">{t("pdfUnreadable", { n: csv.unreadable })}</li>}
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
              {csv.title !== undefined && (
                <div className="contents" data-testid="preview-pdf-title">
                  <dt>{t("pdfTitle")}</dt>
                  <dd>
                    <bdi dir="ltr">{csv.title}</bdi>
                  </dd>
                </div>
              )}
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
