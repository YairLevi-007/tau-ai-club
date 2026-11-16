"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { FileImage, Link2, LoaderCircle, Plus, ScanText } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { slugify } from "@/lib/flyer/match";
import { encodePrefill, wallTimes } from "@/lib/flyer/prefill";
import { hasHebrew, type DraftField, type ImportDraft } from "@/lib/flyer/draft";
import { lumaToDraft } from "@/lib/flyer/luma";
import { parseFlyerText } from "@/lib/flyer/flyer-text";
import type { LumaResponse } from "@/app/api/admin/luma/route";
import { applyFlyer, type SpeakerChoice } from "@/app/[locale]/admin/events/flyer-actions";
import { fileInputClass, hintClass, inputClass, labelClass, panelClass, smallBtn } from "@/components/admin/styles";
import { CropEditor } from "./crop-editor";
import { cropToJpeg, detectFaces, suggestSquare, type Square } from "./face-detect";
import { runFlyerOcr } from "./ocr";

type Named = { id: string; name_he: string; name_en: string };
type Picture = { url: string; img: HTMLImageElement };
/** One line-up row in the review: an existing speaker, a new one typed by the admin, or left out. */
type Row = { choice: string; name_he: string; name_en: string; face: number | null }; // choice: speaker id | "new" | "skip"
type Review = { draft: ImportDraft; rows: Row[]; faces: Square[]; picture: Picture | null };

const MAX_BYTES = 10 * 1024 * 1024;
const TYPES = ["image/png", "image/jpeg", "image/webp"];
const LUMA_IMAGE = /^https:\/\/images\.lumacdn\.com\//;

/** Draft field → the event-form inputs it fills (highlighted there for review). */
function formFields(d: ImportDraft): string[] {
  const has = (f: DraftField) => d.filled.includes(f);
  const out: string[] = [];
  if (has("title_he") && d.title_he) out.push("title_he");
  if (has("title_en") && d.title_en) out.push("title_en");
  if (has("blurb_he") && d.blurb_he) out.push("blurb_he");
  if (has("blurb_en") && d.blurb_en) out.push("blurb_en");
  if (has("kind") && d.kind) out.push("kind");
  if (has("date") && d.date) out.push("starts_at", "ends_at");
  if (d.venue_id) out.push("venue_id");
  else if (d.venue_text) out.push(hasHebrew(d.venue_text) ? "venue_note_he" : "venue_note_en");
  if (d.luma_url) out.push("luma_url");
  return out;
}

async function loadPicture(url: string, cors: boolean): Promise<Picture | null> {
  const img = new Image();
  if (cors) img.crossOrigin = "anonymous";
  img.src = url;
  try {
    await img.decode();
    return { url, img };
  } catch {
    return null;
  }
}

/**
 * "Fill the event from its Luma link or its flyer." Rule-based and free: the Luma page is read
 * on the server (/api/admin/luma, admins only); the flyer is read and faces are found here in the
 * browser. The result only pre-fills the form below; the admin checks it and saves a draft.
 */
export function FlyerImport({ speakers, venues }: { speakers: Named[]; venues: Named[] }) {
  const t = useTranslations("admin");
  const locale = useLocale();
  const router = useRouter();
  const [lumaUrl, setLumaUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<null | "luma" | "reading" | "applying">(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const objectUrl = useRef<string | null>(null);

  useEffect(() => () => void (objectUrl.current && URL.revokeObjectURL(objectUrl.current)), []);
  const nameOf = (s: { name_he: string; name_en: string }) => (locale === "he" ? s.name_he : s.name_en) || s.name_en || s.name_he;

  async function start(draft: ImportDraft, picture: Picture | null) {
    const boxes = picture ? await detectFaces(picture.img) : [];
    const faces = picture ? boxes.map((b) => suggestSquare(b, picture.img.naturalWidth, picture.img.naturalHeight)) : [];
    const rows: Row[] = draft.speakers.map((s) => ({ choice: s.id ?? "new", name_he: s.name_he, name_en: s.name_en, face: null }));
    setReview({ draft, rows, faces, picture });
  }

  async function onLuma() {
    setError(null);
    setReview(null);
    setBusy("luma");
    try {
      const res = await fetch("/api/admin/luma", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: lumaUrl }),
        credentials: "same-origin",
      });
      const json = (await res.json().catch(() => ({ ok: false, error: "failed" }))) as LumaResponse;
      if (!json.ok) {
        const key = ({ forbidden: "importErrorForbidden", bad_url: "lumaErrorUrl", not_found: "lumaErrorNotFound", no_data: "lumaErrorNoData" } as const)[json.error as "forbidden"];
        return setError(t(key ?? "lumaErrorFailed"));
      }
      const draft = lumaToDraft(json.event, speakers, venues);
      const cover = LUMA_IMAGE.test(draft.image_url) ? await loadPicture(draft.image_url, true) : null;
      await start(draft, cover);
    } catch {
      setError(t("lumaErrorFailed"));
    } finally {
      setBusy(null);
    }
  }

  function onPick(f: File | null) {
    setError(null);
    setFile(null);
    if (!f) return;
    if (!TYPES.includes(f.type)) return setError(t("flyerErrorType"));
    if (f.size > MAX_BYTES) return setError(t("flyerErrorSize"));
    setFile(f);
  }

  async function onRead() {
    if (!file) return;
    setError(null);
    setReview(null);
    setBusy("reading");
    setProgress(0);
    try {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = URL.createObjectURL(file);
      const picture = await loadPicture(objectUrl.current, false);
      if (!picture) return setError(t("flyerErrorType"));
      const lines = await runFlyerOcr(objectUrl.current, (p) => setProgress(Math.round(p * 100)));
      await start(parseFlyerText(lines, speakers, venues), picture);
    } catch (e) {
      console.warn("[flyer] reading failed", e);
      setError(t("flyerErrorFailed"));
    } finally {
      setBusy(null);
    }
  }

  const patch = (d: Partial<ImportDraft>, add: DraftField[] = []) =>
    review && setReview({ ...review, draft: { ...review.draft, ...d, filled: [...new Set([...review.draft.filled, ...add])] } });
  const setRow = (i: number, r: Partial<Row>) => review && setReview({ ...review, rows: review.rows.map((x, j) => (j === i ? { ...x, ...r } : x)) });

  async function onApply() {
    if (!review) return;
    setBusy("applying");
    setError(null);
    try {
      const x = review.draft;
      const fields = formFields(x);
      const rows = review.rows.filter((r) => r.choice !== "skip" && (r.choice !== "new" || r.name_he.trim() || r.name_en.trim()));
      if (rows.length) fields.push("speaker_id");
      const prefill = encodePrefill({
        title_he: x.title_he,
        title_en: x.title_en,
        slug: slugify(x.title_en),
        kind: x.kind || "lecture",
        series: "",
        series_no: null,
        blurb_he: x.blurb_he,
        blurb_en: x.blurb_en,
        ...wallTimes(x.date, x.start_time, x.end_time),
        venue_id: x.venue_id ?? "",
        venue_note_he: !x.venue_id && hasHebrew(x.venue_text) ? x.venue_text : "",
        venue_note_en: !x.venue_id && x.venue_text && !hasHebrew(x.venue_text) ? x.venue_text : "",
        luma_url: x.luma_url,
        speaker_ids: [],
        notes: x.date && !x.start_time ? t("flyerDefaultTimes") : "",
        filled: fields,
      });
      const choices: SpeakerChoice[] = rows.map((r) =>
        r.choice === "new" ? { action: "new", name_he: r.name_he.trim(), name_en: r.name_en.trim(), company: "", role: "" } : { action: "existing", id: r.choice },
      );
      const fd = new FormData();
      fd.append("prefill", prefill);
      fd.append("speakers", JSON.stringify(choices));
      if (review.picture) {
        for (let i = 0; i < rows.length; i++) {
          const face = rows[i].face;
          if (face === null) continue;
          const blob = await cropToJpeg(review.picture.img, review.faces[face]);
          if (blob) fd.append(`photo_${i}`, blob, `speaker-${i}.jpg`);
        }
      }
      const result = await applyFlyer(fd);
      if (!result.ok) return setError(t(result.error === "photo" ? "flyerErrorPhoto" : result.error === "speaker" ? "flyerErrorSpeaker" : "flyerErrorFailed"));
      router.push({ pathname: "/admin/events/new", query: { prefill: result.prefill } });
      router.refresh();
    } catch {
      setError(t("flyerErrorFailed"));
    } finally {
      setBusy(null);
    }
  }

  const x = review?.draft;
  const found = (f: DraftField) => !!x?.filled.includes(f);
  const status = (ok: boolean) => (
    <span className={cn("ms-2 text-xs", ok ? "text-brand-purple-soft" : "text-fg-subtle")}>{ok ? t("importFound") : t("importNotFound")}</span>
  );
  const when = x?.date ? wallTimes(x.date, x.start_time, x.end_time) : null;

  return (
    <section aria-labelledby="flyer-heading" className={cn(panelClass, "grid gap-5 p-4 sm:p-6")} data-testid="flyer-import">
      <div className="grid gap-1">
        <h2 id="flyer-heading" className="flex items-center gap-2 text-lg font-bold text-fg">
          <ScanText aria-hidden className="size-5 text-brand-purple-soft" />
          {t("importTitle")}
        </h2>
        <p className={hintClass}>{t("importBody")}</p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <form
          className="grid content-start gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            onLuma();
          }}
        >
          <label className={labelClass}>
            {t("lumaImportLabel")}
            <input
              type="url"
              dir="ltr"
              inputMode="url"
              placeholder="https://luma.com/…"
              value={lumaUrl}
              onChange={(e) => setLumaUrl(e.target.value)}
              className={`${inputClass} text-start`}
              data-testid="luma-url"
            />
          </label>
          <button type="submit" className="btn btn-primary h-10 w-fit px-4 text-sm" disabled={!lumaUrl.trim() || !!busy} data-testid="luma-import">
            {busy === "luma" ? <LoaderCircle aria-hidden className="animate-spin motion-reduce:animate-none" /> : <Link2 aria-hidden />}
            {busy === "luma" ? t("lumaImporting") : t("lumaImport")}
          </button>
          <p className={hintClass}>{t("lumaImportHint")}</p>
        </form>

        <div className="grid content-start gap-2">
          <label className={labelClass}>
            {t("flyerPick")}
            <input type="file" accept={TYPES.join(",")} className={fileInputClass} data-testid="flyer-file" onChange={(e) => onPick(e.target.files?.[0] ?? null)} />
          </label>
          <button type="button" className={cn(smallBtn, "w-fit")} disabled={!file || !!busy} onClick={onRead} data-testid="flyer-read">
            {busy === "reading" ? <LoaderCircle aria-hidden className="animate-spin motion-reduce:animate-none" /> : <FileImage aria-hidden />}
            {busy === "reading" ? t("flyerReading", { percent: progress }) : t("flyerRead")}
          </button>
          <p className={hintClass}>{t("flyerHint")}</p>
        </div>
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {busy === "luma" ? t("lumaImporting") : busy === "reading" ? t("flyerReading", { percent: progress }) : busy === "applying" ? t("flyerApplying") : review ? t("importDone") : ""}
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive" data-testid="flyer-error">
          {error}
        </p>
      )}

      {review && x && (
        <div className="grid gap-5 border-t border-border pt-4" data-testid="flyer-review">
          <p className="text-sm text-fg-muted">{x.source === "luma" ? t("importFromLuma") : t("importFromFlyer")}</p>
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
            <dt className="text-fg-subtle">{t("titleHe")}</dt>
            <dd className="text-fg">
              <bdi dir="rtl" lang="he">{x.title_he || "—"}</bdi>
              {status(!!x.title_he)}
            </dd>
            <dt className="text-fg-subtle">{t("titleEn")}</dt>
            <dd className="text-fg">
              <bdi dir="ltr" lang="en">{x.title_en || "—"}</bdi>
              {status(!!x.title_en)}
            </dd>
            <dt className="text-fg-subtle">{t("sectionWhen")}</dt>
            <dd className="text-fg">
              <bdi dir="ltr">{when ? `${x.date} ${when.starts_at.slice(11)}–${when.ends_at.slice(11)}` : "—"}</bdi>
              {status(found("date"))}
              {found("date") && !x.start_time && <span className="ms-2 text-xs text-fg-subtle">{t("flyerDefaultTimes")}</span>}
            </dd>
            <dt className="text-fg-subtle">{t("venue")}</dt>
            <dd className="text-fg">
              {x.venue_id ? nameOf(venues.find((v) => v.id === x.venue_id) ?? { name_he: "", name_en: "" }) : x.venue_text || "—"}
              {status(!!x.venue_id || !!x.venue_text)}
              {!x.venue_id && x.venue_text && <span className="ms-2 text-xs text-fg-subtle">{t("flyerVenueNoMatch")}</span>}
            </dd>
            <dt className="text-fg-subtle">{t("lumaUrl")}</dt>
            <dd className="text-fg">
              <bdi dir="ltr">{x.luma_url || "—"}</bdi>
              {status(!!x.luma_url)}
            </dd>
          </dl>

          {x.hints.length > 0 && (
            <div className="grid gap-2" data-testid="flyer-hints">
              <p className="text-sm font-semibold text-fg">{t("importHints")}</p>
              <ul className="grid gap-2">
                {x.hints.map((h, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-bg-deep/45 px-3 py-2 text-sm">
                    <span className="text-fg-subtle">{t(`importHint_${h.what}`)}</span>
                    <bdi className="text-fg">{h.text}</bdi>
                    {h.what === "title" && (
                      <>
                        <button type="button" className="btn btn-ghost h-8 px-2 text-xs" onClick={() => patch({ title_he: h.text }, ["title_he"])}>
                          {t("importUseTitleHe")}
                        </button>
                        <button type="button" className="btn btn-ghost h-8 px-2 text-xs" onClick={() => patch({ title_en: h.text }, ["title_en"])}>
                          {t("importUseTitleEn")}
                        </button>
                      </>
                    )}
                    {h.what === "date" && (
                      <button type="button" className="btn btn-ghost h-8 px-2 text-xs" onClick={() => patch({ date: h.text }, ["date"])}>
                        {t("importUseDate")}
                      </button>
                    )}
                    {h.what === "venue" && (
                      <button type="button" className="btn btn-ghost h-8 px-2 text-xs" onClick={() => patch({ venue_id: null, venue_text: h.text }, ["venue"])}>
                        {t("importUseVenue")}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <fieldset className="grid gap-4">
            <legend className="mb-2 text-sm font-semibold text-fg">{t("sectionSpeakers")}</legend>
            {review.rows.length === 0 && <p className={hintClass}>{t("importNoSpeakers")}</p>}
            {review.rows.map((r, i) => (
              <div key={i} className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-2" data-testid="flyer-speaker">
                <label className={labelClass}>
                  {t("flyerSpeakerMatch")}
                  <select value={r.choice} onChange={(e) => setRow(i, { choice: e.target.value })} className={inputClass}>
                    <option value="new">{t("flyerCreateSpeaker")}</option>
                    <option value="skip">{t("flyerSkipSpeaker")}</option>
                    {speakers.map((sp) => (
                      <option key={sp.id} value={sp.id}>
                        {nameOf(sp)}
                      </option>
                    ))}
                  </select>
                </label>
                {r.choice === "new" && (
                  <div className="grid grid-cols-2 gap-3">
                    <label className={labelClass}>
                      {t("nameHe")}
                      <input dir="rtl" lang="he" value={r.name_he} onChange={(e) => setRow(i, { name_he: e.target.value })} className={inputClass} />
                    </label>
                    <label className={labelClass}>
                      {t("nameEn")}
                      <input dir="ltr" lang="en" value={r.name_en} onChange={(e) => setRow(i, { name_en: e.target.value })} className={`${inputClass} text-start`} />
                    </label>
                  </div>
                )}
                {review.picture && review.faces.length > 0 && r.choice !== "skip" && (
                  <div className="grid gap-3 sm:col-span-2">
                    <label className={labelClass}>
                      {t("flyerPhoto")}
                      <select
                        value={r.face === null ? "" : String(r.face)}
                        onChange={(e) => setRow(i, { face: e.target.value === "" ? null : Number(e.target.value) })}
                        className={inputClass}
                      >
                        <option value="">{r.choice === "new" ? t("flyerNoPhoto") : t("flyerKeepPhoto")}</option>
                        {review.faces.map((_, f) => (
                          <option key={f} value={f}>
                            {t("flyerFaceN", { n: f + 1 })}
                          </option>
                        ))}
                      </select>
                    </label>
                    {r.face !== null && (
                      <CropEditor
                        src={review.picture.url}
                        imgW={review.picture.img.naturalWidth}
                        imgH={review.picture.img.naturalHeight}
                        square={review.faces[r.face]}
                        label={t("flyerCropLabel", { n: r.face + 1 })}
                        sizeLabel={t("flyerCropSize")}
                        onChange={(sq) => setReview({ ...review, faces: review.faces.map((q, k) => (k === r.face ? sq : q)) })}
                      />
                    )}
                  </div>
                )}
              </div>
            ))}
            <button
              type="button"
              className={cn(smallBtn, "w-fit")}
              onClick={() => setReview({ ...review, rows: [...review.rows, { choice: "new", name_he: "", name_en: "", face: null }] })}
              disabled={review.rows.length >= 8}
              data-testid="flyer-add-speaker"
            >
              <Plus aria-hidden />
              {t("importAddSpeaker")}
            </button>
            {review.picture && review.faces.length === 0 && <p className={hintClass}>{t("flyerNoFaces")}</p>}
            {review.picture && review.faces.length > 0 && <p className={hintClass}>{t("importFacesFound", { n: review.faces.length })}</p>}
          </fieldset>

          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn btn-primary h-10 px-4 text-sm" disabled={!!busy} onClick={onApply} data-testid="flyer-apply">
              {busy === "applying" ? <LoaderCircle aria-hidden className="animate-spin motion-reduce:animate-none" /> : <FileImage aria-hidden />}
              {t("flyerApply")}
            </button>
            <button type="button" className={smallBtn} disabled={!!busy} onClick={() => setReview(null)}>
              {t("flyerDiscard")}
            </button>
            <p className={hintClass}>{t("flyerApplyHint")}</p>
          </div>
        </div>
      )}
    </section>
  );
}
