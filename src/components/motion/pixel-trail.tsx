"use client";

import { useEffect } from "react";

/**
 * A short trail of pixel squares behind the mouse on the home page (pixel pass, DECISIONS 23.11;
 * the effect is Sean Regev's, from feat/home-pixel-pass). Each time the pointer enters a new
 * 14px cell, one square lights up there and fades out in about half a second.
 *
 * - Mouse only: it starts only where the main pointer can hover finely, and it ignores pen and
 *   touch events, so phones and tablets never run it.
 * - Off under reduced motion, and it stops if that setting turns on.
 * - Never replaces the pointer: links, inputs and text keep their normal cursors, and the layer
 *   ignores clicks (pointer-events: none). Decorative (aria-hidden). Colours are tokens.
 */
const STEP = 14;
const FILLS = ["var(--brand-purple)", "var(--brand-purple-soft)", "var(--logo-block)", "var(--brand-lilac)"];

export function PixelTrail() {
  useEffect(() => {
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let stop: (() => void) | null = null;

    const start = () => {
      const layer = document.createElement("div");
      layer.className = "pixel-trail";
      layer.setAttribute("aria-hidden", "true");
      const pool = Array.from({ length: 28 }, (_, i) => {
        const sq = document.createElement("i");
        sq.style.background = FILLS[i % FILLS.length];
        layer.append(sq);
        return sq;
      });
      document.body.append(layer);
      let next = 0;
      let last = "";
      const onMove = (e: PointerEvent) => {
        if (e.pointerType !== "mouse") return;
        const x = Math.floor(e.clientX / STEP) * STEP;
        const y = Math.floor(e.clientY / STEP) * STEP;
        const cell = `${x},${y}`;
        if (cell === last) return;
        last = cell;
        const sq = pool[next];
        next = (next + 1) % pool.length;
        sq.getAnimations().forEach((a) => a.cancel());
        sq.animate(
          [
            { opacity: 0.9, transform: `translate(${x}px, ${y}px) scale(1)` },
            { opacity: 0, transform: `translate(${x}px, ${y}px) scale(0.4)` },
          ],
          { duration: 520, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "forwards" },
        );
      };
      window.addEventListener("pointermove", onMove, { passive: true });
      return () => {
        window.removeEventListener("pointermove", onMove);
        layer.remove();
      };
    };

    const sync = () => {
      const want = fine.matches && !reduced.matches;
      if (want && !stop) stop = start();
      else if (!want && stop) {
        stop();
        stop = null;
      }
    };
    sync();
    fine.addEventListener("change", sync);
    reduced.addEventListener("change", sync);
    return () => {
      fine.removeEventListener("change", sync);
      reduced.removeEventListener("change", sync);
      stop?.();
    };
  }, []);

  return null;
}
