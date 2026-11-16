"use client";

import { useRef } from "react";
import { clampSquare, type Square } from "./face-detect";

/**
 * A draggable square over the flyer. Drag to move; the slider (or +/- keys) resizes;
 * arrow keys nudge. Coordinates are natural image pixels.
 */
export function CropEditor({
  src,
  imgW,
  imgH,
  square,
  onChange,
  label,
  sizeLabel,
}: {
  src: string;
  imgW: number;
  imgH: number;
  square: Square;
  onChange: (s: Square) => void;
  label: string;
  sizeLabel: string;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const drag = useRef<{ px: number; py: number; sx: number; sy: number } | null>(null);
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  const scale = () => (frame.current ? imgW / frame.current.clientWidth : 1);
  const set = (s: Square) => onChange(clampSquare(s, imgW, imgH));

  return (
    <div className="grid gap-2">
      <div ref={frame} className="relative w-full touch-none overflow-hidden rounded-md border border-border select-none" style={{ aspectRatio: `${imgW} / ${imgH}` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" draggable={false} className="absolute inset-0 size-full object-contain opacity-60" />
        <div
          role="slider"
          tabIndex={0}
          aria-label={label}
          aria-valuetext={`${square.x}, ${square.y}, ${square.size}px`}
          aria-valuenow={square.size}
          className="absolute cursor-move rounded-sm border-2 border-brand-purple shadow-[0_0_0_9999px_rgb(0_0_0/0.45)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-purple"
          style={{ left: pct(square.x, imgW), top: pct(square.y, imgH), width: pct(square.size, imgW), height: pct(square.size, imgH) }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = { px: e.clientX, py: e.clientY, sx: square.x, sy: square.y };
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d) return;
            const k = scale();
            set({ ...square, x: Math.round(d.sx + (e.clientX - d.px) * k), y: Math.round(d.sy + (e.clientY - d.py) * k) });
          }}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
          onKeyDown={(e) => {
            const step = Math.max(4, Math.round(square.size / 20));
            const moves: Record<string, Partial<Square>> = {
              ArrowLeft: { x: square.x - step },
              ArrowRight: { x: square.x + step },
              ArrowUp: { y: square.y - step },
              ArrowDown: { y: square.y + step },
              "+": { size: square.size + step, x: square.x - step / 2, y: square.y - step / 2 },
              "-": { size: square.size - step, x: square.x + step / 2, y: square.y + step / 2 },
            };
            if (moves[e.key]) {
              e.preventDefault();
              set({ ...square, ...moves[e.key] });
            }
          }}
        />
      </div>
      <label className="grid gap-1 text-xs text-fg-subtle">
        {sizeLabel}
        <input
          type="range"
          min={32}
          max={Math.min(imgW, imgH)}
          value={square.size}
          onChange={(e) => {
            const size = Number(e.target.value);
            const c = { x: square.x + square.size / 2, y: square.y + square.size / 2 };
            set({ size, x: Math.round(c.x - size / 2), y: Math.round(c.y - size / 2) });
          }}
          className="accent-brand-purple"
        />
      </label>
    </div>
  );
}
