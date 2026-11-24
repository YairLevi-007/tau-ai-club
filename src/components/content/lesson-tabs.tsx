"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { PixelIcon } from "@/components/home/pixel-icon";

export type LessonTab = "lectures" | "workshops";
const TABS: LessonTab[] = ["lectures", "workshops"];
const fromHash = (hash: string): LessonTab => (hash.replace(/^#/, "") === "workshops" ? "workshops" : "lectures");

/**
 * The page renders this (server side) just before the tabs: it marks <html data-lesson-tab> from
 * the URL hash before the tabs paint, so /learn#workshops (and the old /workshops redirect)
 * never shows Lectures first. The CSS below reads that mark; the tabs keep it in step.
 */
export const LESSON_TAB_SCRIPT = String.raw`(function(d){if(location.hash==="#workshops")d.setAttribute("data-lesson-tab","workshops");else d.removeAttribute("data-lesson-tab")})(document.documentElement)`;

/**
 * "הרצאות | סדנאות" (DECISIONS 25.11): below lg, two tabs at the top of the Lessons page and one
 * panel at a time; from lg up, the two lists side by side in columns, with no tabs (user, 25.11).
 * Both panels are rendered on the server (the page stays
 * cached and readable without JS); which one shows is CSS on <html data-lesson-tab>.
 * Linkable: #lectures / #workshops. Switching updates the hash without jumping the page.
 */
export function LessonTabs({
  lectures,
  workshops,
  labels,
}: {
  lectures: ReactNode;
  workshops: ReactNode;
  labels: { list: string; lectures: string; workshops: string };
}) {
  const [tab, setTab] = useState<LessonTab>("lectures");
  const refs = useRef<Record<LessonTab, HTMLButtonElement | null>>({ lectures: null, workshops: null });

  useEffect(() => {
    const sync = () => setTab(fromHash(window.location.hash));
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  // Keep the page mark in step with the tab; drop it when leaving the page.
  useEffect(() => {
    const root = document.documentElement;
    if (tab === "workshops") root.setAttribute("data-lesson-tab", "workshops");
    else root.removeAttribute("data-lesson-tab");
  }, [tab]);
  useEffect(() => () => document.documentElement.removeAttribute("data-lesson-tab"), []);

  function choose(next: LessonTab, focus = false) {
    setTab(next);
    // Linkable, without the jump an anchor would cause; keep the router's history state.
    window.history.replaceState(window.history.state, "", `#${next}`);
    if (focus) refs.current[next]?.focus();
  }

  function onKey(e: KeyboardEvent<HTMLButtonElement>) {
    const rtl = getComputedStyle(e.currentTarget).direction === "rtl";
    const i = TABS.indexOf(tab);
    const step = e.key === "ArrowRight" ? (rtl ? -1 : 1) : e.key === "ArrowLeft" ? (rtl ? 1 : -1) : 0;
    if (step) choose(TABS[(i + step + TABS.length) % TABS.length], true);
    else if (e.key === "Home") choose(TABS[0], true);
    else if (e.key === "End") choose(TABS[TABS.length - 1], true);
    else return;
    e.preventDefault();
  }

  // The home page's pixel glyphs (DECISIONS 25.11).
  const glyph = { lectures: "lecture", workshops: "build" } as const;
  // Selected look from the page mark, so it's right from the first paint.
  const selectedLook = {
    lectures:
      "[:root:not([data-lesson-tab=workshops])_&]:border-border-accent [:root:not([data-lesson-tab=workshops])_&]:bg-brand-purple-deeper/45 [:root:not([data-lesson-tab=workshops])_&]:text-fg",
    workshops:
      "[:root[data-lesson-tab=workshops]_&]:border-border-accent [:root[data-lesson-tab=workshops]_&]:bg-brand-purple-deeper/45 [:root[data-lesson-tab=workshops]_&]:text-fg",
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:items-start lg:gap-8" data-tab={tab} data-testid="lesson-tabs">
      <div
        role="tablist"
        aria-label={labels.list}
        className="grid w-full grid-cols-2 gap-1 rounded-lg border border-border bg-bg-deep/60 p-1 sm:w-fit sm:min-w-[22rem] lg:hidden"
      >
        {TABS.map((id) => {
          const selected = tab === id;
          return (
            <button
              key={id}
              ref={(el) => {
                refs.current[id] = el;
              }}
              type="button"
              role="tab"
              id={`tab-${id}`}
              aria-controls={id}
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => choose(id)}
              onKeyDown={onKey}
              data-testid={`tab-${id}`}
              className={cn(
                "inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-transparent px-4 text-base font-semibold text-fg-muted transition-colors duration-150 hover:text-fg",
                selectedLook[id],
              )}
            >
              <PixelIcon glyph={glyph[id]} className="h-4 w-auto shrink-0" />
              {labels[id]}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id="lectures"
        aria-labelledby="tab-lectures"
        tabIndex={0}
        className="grid scroll-mt-24 gap-4 rounded-sm [:root[data-lesson-tab=workshops]_&]:hidden lg:[:root[data-lesson-tab=workshops]_&]:grid"
        data-testid="lessons-lectures"
      >
        {lectures}
      </div>
      <div
        role="tabpanel"
        id="workshops"
        aria-labelledby="tab-workshops"
        tabIndex={0}
        className="hidden scroll-mt-24 gap-4 rounded-sm [:root[data-lesson-tab=workshops]_&]:grid lg:grid"
        data-testid="lessons-workshops"
      >
        {workshops}
      </div>
    </div>
  );
}
