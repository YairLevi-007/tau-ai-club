"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { FileImage, LoaderCircle, ScanText, Sparkles } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { slugify } from "@/lib/flyer/match";
import { encodePrefill, wallTimes } from "@/lib/flyer/prefill";
import type { FlyerExtraction } from "@/lib/flyer/schema";
import type { FlyerResponse } from "@/app/api/admin/flyer/route";
import { applyFlyer, type SpeakerChoice } from "@/app/[locale]/admin/events/flyer-actions";
import { fileInputClass, hintClass, inputClass, labelClass, panelClass, smallBtn } from "@/components/admin/styles";
import { CropEditor } from "./crop-editor";
import { cropToJpeg, detectFaces, shrinkForUpload, suggestSquare, type Square } from "./face-detect";

type Named = { id: string; name_he: string; name_en: string };
type Mode = "live" | "mock" | "off";
type Loaded = { url: string; img: HTMLImageElement } | null;
type Review = {
  extraction: FlyerExtraction;
  mode: "live" | "mock";
  venueId: string | null;
  choices: string[]; // per speaker: existing id | "new" | "skip"
  faces: Square[];
  photoFor: (number | null)[]; // per speaker: face index or null
};

const MAX_BYTES = 10 * 1024 * 1024;
const TYPES = ["image/png", "image/jpeg", "image/webp", "application/pdf"];
/** "2027-01-13 18:00–20:00", with the 18:00–20:00 default applied. */
function whenText(x: FlyerExtraction) {
  const w = wallTimes(x.date, x.start_time, x.end_time);
  return w.starts_at ? `${x.date} ${w.starts_at.slice(11)}–${w.ends_at.slice(11)}` : null;
}
const hasHebrew = (s: string) => /[֐-׿]/.test(s);

/**
 * "Upload a flyer and the form fills itself." The flyer goes to /api/admin/flyer (admins
 * only, server-side Claude call); faces are found and cropped here in the browser. The
 * result only pre-fills the form: the admin reviews it and saves a draft.
 */
export function FlyerImport({ mode, speakers, venues }: { mode: Mode; speakers: Named[]; venues: Named[] }) {
  const t = useTranslations("admin");
  const locale = useLocale();
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [loaded, setLoaded] = useState<Loaded>(null);
  const [busy, setBusy] = useState<null | "reading" | "applying">(null);
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => () => void (urlRef.current && URL.revokeObjectURL(urlRef.current)), []);
  const nameOf = (s: Named) => (locale === "he" ? s.name_he : s.name_en) || s.name_en || s.name_he;

  if (mode === "off") {
    return (
      <section aria-labelledby="flyer-heading" className={cn(panelClass, "grid gap-2 p-4 sm:p-6")} data-testid="flyer-import">
        <h2 id="flyer-heading" className="flex items-center gap-2 text-lg font-bold text-fg">
          <ScanText aria-hidden className="size-5 text-fg-subtle" />
          {t("flyerTitle")}
        </h2>
        <p className="text-fg-muted" data-testid="flyer-off">
          {t("flyerOff")}
        </p>
      </section>
    );
  }

  async function onPick(f: File | null) {
    setError(null);
    setReview(null);
    setFile(null);
    setLoaded(null);
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    if (!f) return;
    if (!TYPES.includes(f.type)) return setError(t("flyerErrorType"));
    if (f.size > MAX_BYTES) return setError(t("flyerErrorSize"));
    setFile(f);
    if (f.type.startsWith("image/")) {
      const url = URL.createObjectURL(f);
      urlRef.current = url;
      const img = new Image();
      img.src = url;
      try {
        await img.decode();
        setLoaded({ url, img });
      } catch {
        setError(t("flyerErrorType"));
      }
    }
  }

  async function onRead() {
    if (!file) return;
    setBusy("reading");
    setError(null);
    try {
      const body = new FormData();
      const upload = loaded ? await shrinkForUpload(file, loaded.img) : file;
      body.append("flyer", upload, file.name);
      const [res, faces] = await Promise.all([
        fetch("/api/admin/flyer", { method: "POST", body, credentials: "same-origin" }),
        loaded ? detectFaces(loaded.img) : Promise.resolve([]),
      ]);
      const json = (await res.json().catch(() => ({ ok: false, error: "failed" }))) as FlyerResponse;
      if (!json.ok) {
        const key = ({ forbidden: "flyerErrorForbidden", not_configured: "flyerOff", too_large: "flyerErrorSize", bad_type: "flyerErrorType", refused: "flyerErrorRefused" } as const)[json.error as "forbidden"];
        return setError(t(key ?? "flyerErrorFailed"));
      }
      const squares = loaded ? faces.map((f) => suggestSquare(f, loaded.img.naturalWidth, loaded.img.naturalHeight)) : [];
      const choices = json.extraction.speakers.map((_, i) => json.speakerMatches[i] ?? "new");
      setReview({
        extraction: json.extraction,
        mode: json.mode,
        venueId: json.venueId,
        choices,
        faces: squares,
        // Suggest face i for speaker i when the counts line up; existing speakers keep their photo unless chosen.
        photoFor: choices.map((c, i) => (c === "new" && squares.length === choices.length ? i : null)),
      });
    } catch {
      setError(t("flyerErrorFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function onApply() {
    if (!review) return;
    setBusy("applying");
    setError(null);
    try {
      const x = review.extraction;
      const times = wallTimes(x.date, x.start_time, x.end_time);
      const venueNote = review.venueId ? "" : x.venue_text;
      const prefill = encodePrefill({
        title_he: x.title_he,
        title_en: x.title_en,
        slug: slugify(x.title_en),
        kind: x.kind,
        series: x.series,
        series_no: x.series_no || null,
        blurb_he: x.blurb_he,
        blurb_en: x.blurb_en,
        ...times,
        venue_id: review.venueId ?? "",
        venue_note_he: hasHebrew(venueNote) ? venueNote : "",
        venue_note_en: venueNote && !hasHebrew(venueNote) ? venueNote : "",
        luma_url: x.luma_url,
        speaker_ids: [],
        notes: [x.notes, !x.start_time && x.date ? t("flyerDefaultTimes") : ""].filter(Boolean).join(" "),
      });
      const choices: SpeakerChoice[] = x.speakers.map((s, i) => {
        const c = review.choices[i];
        if (c === "skip") return { action: "skip" };
        if (c === "new") return { action: "new", ...s };
        return { action: "existing", id: c };
      });
      const fd = new FormData();
      fd.append("prefill", prefill);
      fd.append("speakers", JSON.stringify(choices));
      if (loaded) {
        for (let i = 0; i < review.photoFor.length; i++) {
          const face = review.photoFor[i];
          if (face === null || review.choices[i] === "skip") continue;
          const blob = await cropToJpeg(loaded.img, review.faces[face]);
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

  const x = review?.extraction;
  return (
    <section aria-labelledby="flyer-heading" className={cn(panelClass, "grid gap-4 p-4 sm:p-6")} data-testid="flyer-import">
      <div className="grid gap-1">
        <h2 id="flyer-heading" className="flex items-center gap-2 text-lg font-bold text-fg">
          <ScanText aria-hidden className="size-5 text-brand-purple-soft" />
          {t("flyerTitle")}
          {mode === "mock" && <span className="tag">{t("flyerMock")}</span>}
        </h2>
        <p className={hintClass}>{t("flyerBody")}</p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className={labelClass}>
          {t("flyerPick")}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,application/pdf"
            className={fileInputClass}
            data-testid="flyer-file"
            onChange={(e) => onPick(e.target.files?.[0] ?? null)}
          />
        </label>
        <button type="button" className="btn btn-primary h-10 px-4 text-sm" disabled={!file || !!busy} onClick={onRead} data-testid="flyer-read">
          {busy === "reading" ? <LoaderCircle aria-hidden className="animate-spin motion-reduce:animate-none" /> : <Sparkles aria-hidden />}
          {busy === "reading" ? t("flyerReading") : t("flyerRead")}
        </button>
      </div>
      <p className={hintClass}>{t("flyerLimits")}</p>
      <p role="status" aria-live="polite" className="sr-only">
        {busy === "reading" ? t("flyerReading") : busy === "applying" ? t("flyerApplying") : review ? t("flyerDone") : ""}
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive" data-testid="flyer-error">
          {error}
        </p>
      )}

      {review && x && (
        <div className="grid gap-5 border-t border-border pt-4" data-testid="flyer-review">
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
            <dt className="text-fg-subtle">{t("titleHe")}</dt>
            <dd dir="rtl" lang="he" className="text-fg">{x.title_he || "—"}</dd>
            <dt className="text-fg-subtle">{t("titleEn")}</dt>
            <dd dir="ltr" lang="en" className="text-start text-fg">{x.title_en || "—"}</dd>
            <dt className="text-fg-subtle">{t("sectionWhen")}</dt>
            <dd className="text-fg">
              <bdi dir="ltr">{whenText(x) ?? t("flyerNoDate")}</bdi>
            </dd>
            <dt className="text-fg-subtle">{t("venue")}</dt>
            <dd className="text-fg">
              {review.venueId ? nameOf(venues.find((v) => v.id === review.venueId)!) : x.venue_text || t("venueTbd")}
              {!review.venueId && x.venue_text && <span className="ms-2 text-xs text-fg-subtle">{t("flyerVenueNoMatch")}</span>}
            </dd>
            <dt className="text-fg-subtle">{t("lumaUrl")}</dt>
            <dd className="text-fg">
              <bdi dir="ltr">{x.luma_url || "—"}</bdi>
            </dd>
            <dt className="text-fg-subtle">{t("flyerConfidence")}</dt>
            <dd className="text-fg">{t(`flyerConfidence_${x.confidence}`)}</dd>
          </dl>
          {x.notes && <p className="rounded-md border border-border bg-bg-deep/45 p-3 text-sm text-fg-muted">{x.notes}</p>}

          {x.speakers.length > 0 && (
            <fieldset className="grid gap-4">
              <legend className="mb-2 text-sm font-semibold text-fg">{t("sectionSpeakers")}</legend>
              {x.speakers.map((s, i) => {
                const choice = review.choices[i];
                const face = review.photoFor[i];
                const setChoice = (v: string) => setReview({ ...review, choices: review.choices.map((c, j) => (j === i ? v : c)) });
                const setFace = (v: number | null) => setReview({ ...review, photoFor: review.photoFor.map((c, j) => (j === i ? v : c)) });
                return (
                  <div key={i} className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-2" data-testid="flyer-speaker">
                    <div className="grid gap-1">
                      <p className="font-semibold text-fg">
                        <bdi>{(locale === "he" ? s.name_he : s.name_en) || s.name_en || s.name_he}</bdi>
                      </p>
                      {(s.role || s.company) && <p className="text-sm text-fg-subtle">{[s.role, s.company].filter(Boolean).join(" · ")}</p>}
                    </div>
                    <label className={labelClass}>
                      {t("flyerSpeakerMatch")}
                      <select value={choice} onChange={(e) => setChoice(e.target.value)} className={inputClass}>
                        <option value="new">{t("flyerCreateSpeaker")}</option>
                        <option value="skip">{t("flyerSkipSpeaker")}</option>
                        {speakers.map((sp) => (
                          <option key={sp.id} value={sp.id}>
                            {nameOf(sp)}
                          </option>
                        ))}
                      </select>
                    </label>
                    {loaded && review.faces.length > 0 && choice !== "skip" && (
                      <div className="grid gap-3 sm:col-span-2">
                        <label className={labelClass}>
                          {t("flyerPhoto")}
                          <select
                            value={face === null ? "" : String(face)}
                            onChange={(e) => setFace(e.target.value === "" ? null : Number(e.target.value))}
                            className={inputClass}
                          >
                            <option value="">{choice === "new" ? t("flyerNoPhoto") : t("flyerKeepPhoto")}</option>
                            {review.faces.map((_, f) => (
                              <option key={f} value={f}>
                                {t("flyerFaceN", { n: f + 1 })}
                              </option>
                            ))}
                          </select>
                        </label>
                        {face !== null && (
                          <CropEditor
                            src={loaded.url}
                            imgW={loaded.img.naturalWidth}
                            imgH={loaded.img.naturalHeight}
                            square={review.faces[face]}
                            label={t("flyerCropLabel", { n: face + 1 })}
                            sizeLabel={t("flyerCropSize")}
                            onChange={(sq) => setReview({ ...review, faces: review.faces.map((q, k) => (k === face ? sq : q)) })}
                          />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {loaded && review.faces.length === 0 && <p className={hintClass}>{t("flyerNoFaces")}</p>}
              {!loaded && <p className={hintClass}>{t("flyerPdfNoFaces")}</p>}
            </fieldset>
          )}

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
