"use client";

import { useTranslations } from "next-intl";
import { hasHebrew } from "@/lib/flyer/draft";
import type { PersonFields } from "@/lib/flyer/people";
import type { Square } from "./face-detect";

export type ChipUse = "name" | "role" | "company";

/** Put a chip's text in the Hebrew or English field it belongs to. */
export function placeChip(use: ChipUse, text: string): Partial<PersonFields> {
  return { [`${use}_${hasHebrew(text) ? "he" : "en"}`]: text };
}

/** The proposed crop, shown as a small square (the flyer as a background, scaled and shifted). */
export function FacePreview({ src, imgW, imgH, square, size = 96 }: { src: string; imgW: number; imgH: number; square: Square; size?: number }) {
  const k = size / square.size;
  return (
    <div
      aria-hidden
      className="shrink-0 rounded-md border border-border bg-no-repeat"
      style={{
        width: size,
        height: size,
        backgroundImage: `url("${src}")`,
        backgroundSize: `${imgW * k}px ${imgH * k}px`,
        backgroundPosition: `${-square.x * k}px ${-square.y * k}px`,
      }}
      data-testid="person-face"
    />
  );
}

/** The text printed next to a photo, one line per chip, each with "use as name / role / company". */
export function CaptionChips({ chips, onUse }: { chips: string[]; onUse: (use: ChipUse, text: string) => void }) {
  const t = useTranslations("admin");
  if (!chips.length) return <p className="text-xs text-fg-subtle">{t("flyerNoCaption")}</p>;
  return (
    <ul className="grid gap-1.5" aria-label={t("flyerCaption")} data-testid="person-chips">
      {chips.map((c) => (
        <li key={c} className="flex flex-wrap items-center gap-1.5 text-sm">
          <bdi className="rounded-sm bg-bg-deep/60 px-2 py-0.5 text-fg" data-testid="person-chip">
            {c}
          </bdi>
          {(["name", "role", "company"] as const).map((use) => (
            <button key={use} type="button" className="btn btn-ghost h-7 px-2 text-xs" onClick={() => onUse(use, c)} data-testid={`chip-${use}`}>
              {t(use === "name" ? "flyerUseName" : use === "role" ? "flyerUseRole" : "flyerUseCompany")}
            </button>
          ))}
        </li>
      ))}
    </ul>
  );
}
