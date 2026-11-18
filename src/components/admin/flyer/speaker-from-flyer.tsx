"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, FileImage, LoaderCircle, ScanText, UserRoundCheck } from "lucide-react";
import { slugify } from "@/lib/flyer/match";
import { captionChips, guessPerson, type PersonFields } from "@/lib/flyer/people";
import { uploadSpeakerPhoto } from "@/app/[locale]/admin/speaker-profiles/actions";
import { hintClass, labelClass, smallBtn } from "@/components/admin/styles";
import { FilePicker } from "@/components/admin/file-picker";
import { cn } from "@/lib/utils";
import { CropEditor } from "./crop-editor";
import { cropToJpeg, type Square } from "./face-detect";
import { CaptionChips, FacePreview, placeChip } from "./person-card";
import { readFlyer, type FlyerPerson } from "./read-flyer";

const MAX_BYTES = 10 * 1024 * 1024;
const TYPES = ["image/png", "image/jpeg", "image/webp"];

/**
 * "From flyer" inside a speaker form: read a flyer in the browser, show each face with the text
 * printed next to it, and fill this form (name, role, company, slug, photo) from the one the
 * admin picks. Nothing is saved until the admin saves the form; only the photo crop is uploaded
 * when they choose "Use this person".
 */
export function SpeakerFromFlyer() {
  const t = useTranslations("admin");
  const root = useRef<HTMLDetailsElement>(null);
  const url = useRef<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<null | "reading" | "using">(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [picture, setPicture] = useState<{ url: string; img: HTMLImageElement } | null>(null);
  const [people, setPeople] = useState<(FlyerPerson & { chips: string[] })[] | null>(null);

  useEffect(() => () => void (url.current && URL.revokeObjectURL(url.current)), []);

  /** Set one field of the enclosing speaker form (its inputs are uncontrolled). */
  function setField(name: string, value: string, onlyIfEmpty = false) {
    const el = root.current?.closest("form")?.elements.namedItem(name);
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) || !value) return;
    if (onlyIfEmpty && el.value.trim()) return;
    el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
  function fill(fields: Partial<PersonFields>) {
    for (const [k, v] of Object.entries(fields)) setField(k, v ?? "");
    if (fields.name_en) setField("slug", slugify(fields.name_en), true);
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
    setDone(null);
    setPeople(null);
    setBusy("reading");
    setProgress(0);
    try {
      if (url.current) URL.revokeObjectURL(url.current);
      url.current = URL.createObjectURL(file);
      const img = new Image();
      img.src = url.current;
      await img.decode();
      setPicture({ url: url.current, img });
      const reading = await readFlyer(url.current, {}, (p) => setProgress(Math.round(p * 100)));
      setPeople(reading.people.map((p) => ({ ...p, chips: captionChips(p.caption) })));
    } catch (e) {
      console.warn("[flyer] reading failed", e);
      setError(t("flyerErrorFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function onUse(p: FlyerPerson) {
    if (!picture) return;
    setBusy("using");
    setError(null);
    try {
      const g = guessPerson(p.caption, []);
      fill({ name_he: g.name_he, name_en: g.name_en, role_he: g.role_he, role_en: g.role_en, company_he: g.company_he, company_en: g.company_en });
      const blob = await cropToJpeg(picture.img, p.square);
      const fd = new FormData();
      if (blob) fd.append("photo", blob, "speaker.jpg");
      const res = blob ? await uploadSpeakerPhoto(fd) : { ok: false as const };
      if (res.ok) setField("photo_url", res.url);
      setDone(res.ok ? t("speakerFlyerFilled") : t("flyerErrorPhoto"));
    } catch {
      setError(t("flyerErrorPhoto"));
    } finally {
      setBusy(null);
    }
  }

  const setSquare = (i: number, square: Square) => people && setPeople(people.map((p, j) => (j === i ? { ...p, square } : p)));

  return (
    <details ref={root} className="group/flyer min-w-0 rounded-lg border border-border-accent/70 bg-brand-purple-deeper/15 sm:col-span-2" data-testid="speaker-flyer">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-fg [&::-webkit-details-marker]:hidden">
        <ScanText aria-hidden className="size-4 text-brand-purple-soft" />
        {t("speakerFromFlyer")}
        <ChevronDown aria-hidden className="ms-auto size-4 text-fg-subtle transition-transform duration-200 group-open/flyer:rotate-180" />
      </summary>
      <div className="grid gap-3 border-t border-border px-4 pt-3 pb-4">
        <p className={hintClass}>{t("speakerFromFlyerHint")}</p>
        <div className="flex flex-wrap items-end gap-3">
          <label className={labelClass}>
            {t("flyerPick")}
            <FilePicker accept={TYPES.join(",")} onChange={(e) => onPick(e.target.files?.[0] ?? null)} data-testid="speaker-flyer-file" />
          </label>
          <button type="button" className={cn(smallBtn, "w-fit")} disabled={!file || !!busy} onClick={onRead} data-testid="speaker-flyer-read">
            {busy === "reading" ? <LoaderCircle aria-hidden className="animate-spin motion-reduce:animate-none" /> : <FileImage aria-hidden />}
            {busy === "reading" ? t("flyerReading", { percent: progress }) : t("flyerRead")}
          </button>
        </div>
        <p role="status" aria-live="polite" className="text-sm text-fg-muted">
          {busy === "using" ? t("speakerFlyerUsing") : (done ?? "")}
        </p>
        {error && (
          <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        {people && picture && people.length === 0 && <p className={hintClass}>{t("speakerFlyerNoFaces")}</p>}
        {people && picture && (
          <ul className="grid gap-3">
            {people.map((p, i) => (
              <li key={i} className="grid gap-4 rounded-lg border border-border-accent/70 bg-bg-deep/35 p-4" data-testid="speaker-flyer-person">
                <div className="flex items-center gap-4">
                  <FacePreview src={picture.url} imgW={picture.img.naturalWidth} imgH={picture.img.naturalHeight} square={p.square} />
                  <div className="grid min-w-0 gap-2">
                    <p className="text-sm font-semibold text-fg">{t("flyerFaceN", { n: i + 1 })}</p>
                    <button type="button" className="btn btn-primary h-10 w-fit px-4 text-sm" disabled={!!busy} onClick={() => onUse(p)} data-testid="speaker-flyer-use">
                      <UserRoundCheck aria-hidden />
                      {t("speakerFlyerUse")}
                    </button>
                  </div>
                </div>
                <CaptionChips chips={p.chips} onUse={(use, text) => fill({ ...placeChip(use, text) })} />
                <details>
                  <summary className="cursor-pointer text-sm text-fg-muted">{t("flyerAdjustCrop")}</summary>
                  <div className="pt-3">
                    <CropEditor
                      src={picture.url}
                      imgW={picture.img.naturalWidth}
                      imgH={picture.img.naturalHeight}
                      square={p.square}
                      label={t("flyerCropLabel", { n: i + 1 })}
                      sizeLabel={t("flyerCropSize")}
                      onChange={(sq) => setSquare(i, sq)}
                    />
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
