"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CircleCheck, CircleDashed, FileImage, Link2, LoaderCircle, Plus, ScanText } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { matchSpeaker, slugify } from "@/lib/flyer/match";
import { encodePrefill, wallTimes } from "@/lib/flyer/prefill";
import { hasHebrew, type DraftField, type ImportDraft } from "@/lib/flyer/draft";
import { lumaToDraft } from "@/lib/flyer/luma";
import { parseFlyerText } from "@/lib/flyer/flyer-text";
import { captionChips, guessPerson, type PersonFields } from "@/lib/flyer/people";
import type { LumaResponse } from "@/app/api/admin/luma/route";
import { applyFlyer, type SpeakerChoice } from "@/app/[locale]/admin/events/flyer-actions";
import { hintClass, inputClass, labelClass, smallBtn } from "@/components/admin/styles";
import { FilePicker } from "@/components/admin/file-picker";
import { CropEditor } from "./crop-editor";
import { cropToJpeg, type Square } from "./face-detect";
import { readFlyer, type FlyerReading } from "./read-flyer";
import { CaptionChips, FacePreview, NoFace, placeChip, type ChipUse } from "./person-card";

type Named = { id: string; name_he: string; name_en: string };
type SpeakerOption = Named & { photo_url?: string | null };
type Picture = { url: string; img: HTMLImageElement };
/**
 * One person in the review: a face found on the flyer (with the text printed next to it as
 * chips), or a speaker named in the text. `choice` is an existing speaker id, "new" or "skip".
 */
type Row = PersonFields & { choice: string; face: number | null; chips: string[] };
const blank: PersonFields = { name_he: "", name_en: "", role_he: "", role_en: "", company_he: "", company_en: "" };
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
export function FlyerImport({ speakers, venues }: { speakers: SpeakerOption[]; venues: Named[] }) {
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
  const pick = (r: Row, f: "name" | "role" | "company") =>
    ((locale === "he" ? r[`${f}_he`] : r[`${f}_en`]) || r[`${f}_en`] || r[`${f}_he`]).trim();
  /** The name a card will save: the linked speaker's, or the one typed for a new speaker. */
  const who = (r: Row) => {
    const known = speakers.find((s) => s.id === r.choice);
    return known ? nameOf(known) : pick(r, "name");
  };
  const whatLine = (r: Row) => [pick(r, "role"), pick(r, "company")].filter(Boolean).join(" · ");

  function start(draft: ImportDraft, picture: Picture | null, reading: FlyerReading | null) {
    const people = picture ? (reading?.people ?? []) : [];
    const rows: Row[] = [];
    // One row per face: who it is (a speaker on the site, or a new one prefilled from the
    // caption), and its crop as the photo, unless an existing speaker already has one.
    people.forEach((p, i) => {
      const { speakerId, ...fields } = guessPerson(p.caption, speakers);
      const known = speakerId ? speakers.find((s) => s.id === speakerId) : undefined;
      const dup = !!speakerId && rows.some((r) => r.choice === speakerId);
      rows.push({ ...fields, choice: dup ? "skip" : (speakerId ?? "new"), face: known?.photo_url ? null : i, chips: captionChips(p.caption) });
    });
    // Speakers named elsewhere on the flyer (or on Luma) without a face of their own.
    for (const s of draft.speakers) {
      if (s.id && rows.some((r) => r.choice === s.id)) continue;
      rows.push({ ...blank, name_he: s.name_he, name_en: s.name_en, choice: s.id ?? "new", face: null, chips: [] });
    }
    setReview({ draft, rows, faces: people.map((p) => p.square), picture });
  }

  /** A caption chip tapped as name / role / company. A name that is a speaker on the site links to them. */
  function applyChip(i: number, use: ChipUse, text: string) {
    if (use === "name") {
      const m = matchSpeaker(hasHebrew(text) ? { name_he: text, name_en: "" } : { name_he: "", name_en: text }, speakers);
      if (m) return setRow(i, { choice: m.id, name_he: m.name_he, name_en: m.name_en });
      return setRow(i, { choice: "new", ...placeChip(use, text) });
    }
    setRow(i, placeChip(use, text));
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
      const reading = cover ? await readFlyer(cover.url).catch(() => null) : null;
      start(draft, cover, reading);
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
      const reading = await readFlyer(objectUrl.current, { page: true }, (p) => setProgress(Math.round(p * 100)));
      start(parseFlyerText(reading.lines, speakers, venues), picture, reading);
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
        r.choice === "new"
          ? { action: "new", name_he: r.name_he, name_en: r.name_en, role_he: r.role_he, role_en: r.role_en, company_he: r.company_he, company_en: r.company_en }
          : { action: "existing", id: r.choice },
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
    <span className={cn("ms-2 inline-flex items-center gap-1 align-middle text-xs", ok ? "text-brand-purple-soft" : "text-fg-subtle")}>
      {ok ? <CircleCheck aria-hidden className="size-3.5" /> : <CircleDashed aria-hidden className="size-3.5" />}
      {ok ? t("importFound") : t("importNotFound")}
    </span>
  );
  const when = x?.date ? wallTimes(x.date, x.start_time, x.end_time) : null;

  return (
    <section
      aria-labelledby="flyer-heading"
      className="grid gap-5 rounded-lg border border-border-accent bg-bg-raised p-4 shadow-[var(--shadow-featured)] [background-image:var(--card-featured-bg)] sm:p-6"
      data-testid="flyer-import"
    >
      <div className="flex items-start gap-3.5">
        <span className="grid size-10 shrink-0 place-items-center rounded-md border border-border-accent bg-brand-purple-deeper text-brand-purple-soft [&_svg]:size-5">
          <ScanText aria-hidden />
        </span>
        <div className="grid gap-1">
          <h2 id="flyer-heading" className="text-lg font-bold text-fg">
            {t("importTitle")}
          </h2>
          <p className="max-w-[65ch] text-sm text-fg-muted">{t("importBody")}</p>
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 sm:gap-0">
        <form
          className="grid content-start gap-2 sm:pe-6"
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

        <div className="grid content-start gap-2 border-t border-border pt-5 sm:border-t-0 sm:border-s sm:pt-0 sm:ps-6">
          <label className={labelClass}>
            {t("flyerPick")}
            <FilePicker accept={TYPES.join(",")} data-testid="flyer-file" onChange={(e) => onPick(e.target.files?.[0] ?? null)} />
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
        <p role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 px-3.5 py-2.5 text-sm text-fg" data-testid="flyer-error">
          {error}
        </p>
      )}

      {review && x && (
        <div className="grid gap-5 border-t border-border pt-4" data-testid="flyer-review">
          <p className="text-sm text-fg-muted">{x.source === "luma" ? t("importFromLuma") : t("importFromFlyer")}</p>
          <dl className="grid gap-x-6 gap-y-1 rounded-md border border-border bg-bg-deep/45 p-3.5 text-sm sm:grid-cols-[auto_1fr] sm:gap-y-2.5">
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
              <div
                key={i}
                className={cn(
                  "grid gap-4 rounded-lg border bg-bg-deep/35 p-4 sm:p-5",
                  r.choice === "skip" ? "border-dashed border-border" : "border-border-accent/70",
                )}
                data-testid="flyer-speaker"
              >
                {/* Who this card will save: the face from the flyer and the details as they'll appear. */}
                <div className={cn("flex items-center gap-4", r.choice === "skip" && "opacity-60")}>
                  {review.picture && r.face !== null && review.faces[r.face] ? (
                    <FacePreview
                      src={review.picture.url}
                      imgW={review.picture.img.naturalWidth}
                      imgH={review.picture.img.naturalHeight}
                      square={review.faces[r.face]}
                      size={96}
                    />
                  ) : (
                    <NoFace size={96} />
                  )}
                  <div className="grid min-w-0 gap-1">
                    <p className="text-lg leading-tight font-bold text-balance break-words text-fg">{who(r) ? <bdi>{who(r)}</bdi> : <span className="font-normal text-fg-subtle">{t("flyerNoName")}</span>}</p>
                    {r.choice === "new" && whatLine(r) && <p className="text-sm text-fg-muted">{whatLine(r)}</p>}
                    <p className="text-xs text-brand-purple-soft">
                      {r.choice === "skip" ? t("flyerSkipSpeaker") : r.choice === "new" ? t("flyerCreateSpeaker") : t("flyerLinked")}
                    </p>
                  </div>
                </div>
                <label className={labelClass}>
                  {t("flyerSpeakerMatch")}
                  <select value={r.choice} onChange={(e) => setRow(i, { choice: e.target.value })} className={inputClass} data-testid="flyer-speaker-choice">
                    <option value="new">{t("flyerCreateSpeaker")}</option>
                    <option value="skip">{t("flyerSkipSpeaker")}</option>
                    {speakers.map((sp) => (
                      <option key={sp.id} value={sp.id}>
                        {nameOf(sp)}
                      </option>
                    ))}
                  </select>
                </label>
                {r.chips.length > 0 && r.choice !== "skip" && <CaptionChips chips={r.chips} onUse={(use, text) => applyChip(i, use, text)} />}
                {r.choice === "new" && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {(["name", "role", "company"] as const).map((f) => (
                      <Fragment key={f}>
                        <label className={labelClass}>
                          {t(`${f}He`)}
                          <input dir="rtl" lang="he" value={r[`${f}_he`]} onChange={(e) => setRow(i, { [`${f}_he`]: e.target.value })} className={inputClass} data-testid={`flyer-${f}-he`} />
                        </label>
                        <label className={labelClass}>
                          {t(`${f}En`)}
                          <input dir="ltr" lang="en" value={r[`${f}_en`]} onChange={(e) => setRow(i, { [`${f}_en`]: e.target.value })} className={`${inputClass} text-start`} data-testid={`flyer-${f}-en`} />
                        </label>
                      </Fragment>
                    ))}
                  </div>
                )}
                {review.picture && review.faces.length > 0 && r.choice !== "skip" && (
                  <div className="grid gap-3">
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
                      <details>
                        <summary className="cursor-pointer text-sm text-fg-muted">{t("flyerAdjustCrop")}</summary>
                        <div className="pt-3">
                          <CropEditor
                            src={review.picture.url}
                            imgW={review.picture.img.naturalWidth}
                            imgH={review.picture.img.naturalHeight}
                            square={review.faces[r.face]}
                            label={t("flyerCropLabel", { n: r.face + 1 })}
                            sizeLabel={t("flyerCropSize")}
                            onChange={(sq) => setReview({ ...review, faces: review.faces.map((q, k) => (k === r.face ? sq : q)) })}
                          />
                        </div>
                      </details>
                    )}
                  </div>
                )}
              </div>
            ))}
            <button
              type="button"
              className={cn(smallBtn, "w-fit")}
              onClick={() => setReview({ ...review, rows: [...review.rows, { ...blank, choice: "new", face: null, chips: [] }] })}
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
