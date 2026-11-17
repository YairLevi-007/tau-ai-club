"use client";

import { useEffect, useRef } from "react";
import { dur, distance, ease, revealStagger } from "@/lib/motion";

/**
 * Scroll reveals for server-rendered content (design/motion-spec.md §3).
 *
 * Renders nothing visible. After hydration it finds `[data-reveal]` elements in
 * its parent and fades/slides in the ones that are still BELOW the fold, once.
 * Everything is visible in the SSR HTML, so with JS off, before hydration, or
 * under reduced motion, nothing is ever hidden. Elements already on screen are
 * left alone (no flash).
 */
export function RevealOnScroll() {
  const marker = useRef<HTMLSpanElement>(null);

  // Once the intro has played, mark it seen so client-side navigations (e.g. the
  // language switch) don't replay it.
  useEffect(() => {
    const id = window.setTimeout(() => document.documentElement.setAttribute("data-intro-seen", ""), 1200);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    const root = marker.current?.parentElement;
    if (!root) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const els = Array.from(root.querySelectorAll<HTMLElement>("[data-reveal]")).filter(
      (el) => el.getBoundingClientRect().top > window.innerHeight,
    );
    const stops: Array<() => void> = [];
    let cancelled = false;

    // `motion` loads after hydration, in its own chunk (QA audit S2). Elements are hidden
    // only once it has arrived, and they're all below the fold, so nothing flashes.
    void import("motion").then(({ animate, inView }) => {
      if (cancelled) return;
      els.forEach((el, i) => {
        el.style.opacity = "0";
        el.style.transform = `translateY(${distance.reveal}px)`;
        stops.push(
          inView(
            el,
            () => {
              animate(
                el,
                { opacity: 1, transform: "translateY(0px)" },
                { duration: dur.reveal, ease: [...ease.out], delay: (i % 3) * revealStagger },
              );
            },
            { margin: "0px 0px -10% 0px" },
          ),
        );
      });
    });

    return () => {
      cancelled = true;
      stops.forEach((stop) => stop());
      els.forEach((el) => {
        el.style.opacity = "";
        el.style.transform = "";
      });
    };
  }, []);

  return <span ref={marker} hidden />;
}
