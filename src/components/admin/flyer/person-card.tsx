"use client";

import { useTranslations } from "next-intl";
import { UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { hasHebrew } from "@/lib/flyer/draft";
import type { PersonFields } from "@/lib/flyer/people";
import type { Square } from "./face-detect";

export type ChipUse = "name" | "role" | "company";

/** Put a chip's text in the Hebrew or English field it belongs to. */
export function placeChip(use: ChipUse, text: string): Partial<PersonFields> {
  return { [`${use}_${hasHebrew(text) ? "he" : "en"}`]: text };
}

/** The proposed crop, shown as a square (the flyer as a background, scaled and shifted). */
export function FacePreview({
  src,
  imgW,
  imgH,
  square,
  size = 96,
  className,
}: {
  src: string;
  imgW: number;
  imgH: number;
  square: Square;
  size?: number;
  className?: string;
}) {
  const k = size / square.size;
  return (
    <div
      aria-hidden
      className={cn("shrink-0 rounded-lg border border-border-accent bg-no-repeat shadow-[var(--highlight-top)]", className)}
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

/** Where a face would be when this person has none: same footprint, so the cards line up. */
export function NoFace({ size = 96 }: { size?: number }) {
  return (
    <div
      aria-hidden
      className="grid shrink-0 place-items-center rounded-lg border border-dashed border-border text-fg-faint"
      style={{ width: size, height: size }}
    >
      <UserRound className="size-1/3" />
    </div>
  );
}

/**
 * The text printed next to a photo, one line per chip. Each line ends in a small
 * name / role / company switch: one tap puts the text in that field.
 */
export function CaptionChips({ chips, onUse }: { chips: string[]; onUse: (use: ChipUse, text: string) => void }) {
  const t = useTranslations("admin");
  if (!chips.length) return <p className="text-xs text-fg-subtle">{t("flyerNoCaption")}</p>;
  const uses = [
    ["name", "flyerChipName", "flyerUseName"],
    ["role", "flyerChipRole", "flyerUseRole"],
    ["company", "flyerChipCompany", "flyerUseCompany"],
  ] as const;
  return (
    <div className="grid gap-2">
      <p className="text-xs font-medium text-fg-subtle">{t("flyerCaption")}</p>
      <ul className="grid gap-1.5" aria-label={t("flyerCaption")} data-testid="person-chips">
        {chips.map((c) => (
          <li
            key={c}
            className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 rounded-md border border-border bg-bg/50 py-1 ps-3 pe-1"
          >
            <bdi className="min-w-0 py-1 text-sm break-words text-fg" data-testid="person-chip">
              {c}
            </bdi>
            <span className="inline-flex shrink-0 overflow-hidden rounded-md border border-border" role="group" aria-label={t("flyerChipUse", { text: c })}>
              {uses.map(([use, short, full], k) => (
                <button
                  key={use}
                  type="button"
                  title={t(full)}
                  aria-label={t(full)}
                  className={cn(
                    "h-8 px-2.5 text-xs font-medium text-fg-muted transition-colors duration-150 hover:bg-brand-purple-deeper/60 hover:text-fg focus-visible:relative",
                    k > 0 && "border-s border-border",
                  )}
                  onClick={() => onUse(use, c)}
                  data-testid={`chip-${use}`}
                >
                  {t(short)}
                </button>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
