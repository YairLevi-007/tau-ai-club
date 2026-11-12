"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { animate, MotionConfig, motion, useMotionValue, useMotionValueEvent, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { dur, ease } from "@/lib/motion";

export type DialEvent = {
  slug: string;
  title: string;
  state: "past" | "live" | "next" | "upcoming";
  tentative: boolean;
  venueTbd: boolean;
  /** Israel-time calendar day number. */
  day: number;
  startsAt: string;
  weekday: string;
  shortDate: string;
  fullDate: string;
  timeRange: string;
  who: string | null;
};

type Props = {
  events: DialEvent[];
  startDay: number;
  endDay: number;
  nowDay: number;
  /** Index of the next/live event, or -1 when the season is over. */
  nextIndex: number;
  /** Weekday + dd.mm for every day in [startDay, endDay], for the live readout. */
  dayLabels: { weekday: string; shortDate: string }[];
  months: { day: number; label: string }[];
  rtl: boolean;
};

/** The ring covers this many degrees; the rest is a gap so the season's start and end don't touch. */
const ARC = 320;
const VIEW = 400;
const C = VIEW / 2;
const R_TICKS = 132;
const R_NODES = 170;

/** Round to 2 decimals: server (Node) and browser trig differ in the last digits, which breaks hydration. */
const round2 = (n: number) => Math.round(n * 100) / 100;
const norm = (deg: number) => ((((deg + 180) % 360) + 360) % 360) - 180;

/**
 * The season dial (user's pick, 2026-11-13). The whole season sits on one ring;
 * you rotate it by dragging around the ring, the fixed pointer at the top picks
 * the day, and releasing snaps to the nearest meetup. Clockwise = forward in
 * time in both languages (it's a clock, so it isn't mirrored). Node positions
 * are physical left/top on purpose: this is circular geometry, not page layout.
 *
 * The parent keys this component by the next event's slug, so a new "next"
 * (ISR revalidation) remounts it at the right position.
 *
 * Accessibility: every meetup is a real link in an <ol> (works with JS off),
 * with roving focus; ←/→ (mirrored in RTL), Home/End move between meetups.
 */
export function SeasonDial({ events, startDay, endDay, nowDay, nextIndex, dayLabels, months, rtl }: Props) {
  const t = useTranslations("season");
  const te = useTranslations("event");
  const reduce = useReducedMotion();
  const span = Math.max(1, endDay - startDay);
  const angleOf = useCallback((day: number) => ((day - startDay) / span) * ARC, [startDay, span]);
  const homeIndex = nextIndex >= 0 ? nextIndex : events.length - 1;

  const [sel, setSel] = useState(homeIndex);
  const selRef = useRef(homeIndex);
  const [readDay, setReadDay] = useState(events[homeIndex]?.day ?? startDay);
  const rot = useMotionValue(-angleOf(events[homeIndex]?.day ?? startDay));
  const linkRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const dialRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ lastAngle: number; lastT: number; vel: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const [interacted, setInteracted] = useState(false);

  const minRot = -angleOf(events.at(-1)?.day ?? endDay);
  const maxRot = -angleOf(events[0]?.day ?? startDay);
  const clampRot = useCallback((r: number) => Math.min(maxRot, Math.max(minRot, r)), [minRot, maxRot]);

  const dayAtRot = useCallback((r: number) => startDay + (-r / ARC) * span, [startDay, span]);
  const nearest = useCallback(
    (r: number) => {
      const d = dayAtRot(r);
      return events.reduce((best, e, i) => (Math.abs(e.day - d) < Math.abs(events[best].day - d) ? i : best), 0);
    },
    [events, dayAtRot],
  );

  const choose = useCallback(
    (i: number, opts: { spin?: boolean; focus?: boolean } = {}) => {
      if (i < 0 || i >= events.length) return;
      setInteracted(true);
      if (i !== selRef.current && drag.current && typeof navigator !== "undefined") navigator.vibrate?.(6);
      selRef.current = i;
      setSel(i);
      if (opts.spin !== false) {
        animate(rot, -angleOf(events[i].day), reduce ? { duration: 0 } : { type: "spring", bounce: 0, duration: 0.6 });
      }
      if (opts.focus) linkRefs.current[i]?.focus({ preventScroll: true });
    },
    [events, rot, angleOf, reduce],
  );

  useMotionValueEvent(rot, "change", (r) => {
    const d = Math.round(dayAtRot(r));
    setReadDay((prev) => (prev === d ? prev : d));
    if (drag.current) {
      const n = nearest(r);
      if (n !== selRef.current) choose(n, { spin: false });
    }
  });

  // --- Pointer: rotate by dragging around the ring --------------------------------
  const pointerAngle = (ev: { clientX: number; clientY: number }) => {
    const box = dialRef.current!.getBoundingClientRect();
    const x = ev.clientX - (box.left + box.width / 2);
    const y = ev.clientY - (box.top + box.height / 2);
    return { deg: (Math.atan2(x, -y) * 180) / Math.PI, dist: Math.hypot(x, y) / (box.width / 2) };
  };

  const onPointerDown = (ev: React.PointerEvent) => {
    const { deg, dist } = pointerAngle(ev);
    if (dist < 0.5) return; // the center is for reading (and page scroll on touch)
    dialRef.current!.setPointerCapture(ev.pointerId);
    rot.stop();
    drag.current = { lastAngle: deg, lastT: performance.now(), vel: 0, moved: false };
  };
  const onPointerMove = (ev: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const { deg } = pointerAngle(ev);
    const delta = norm(deg - d.lastAngle);
    const now = performance.now();
    d.vel = delta / Math.max(1, now - d.lastT);
    d.lastAngle = deg;
    d.lastT = now;
    if (Math.abs(delta) > 0.3) d.moved = true;
    rot.set(clampRot(rot.get() + delta));
  };
  const onPointerUp = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    suppressClick.current = d.moved;
    const projected = clampRot(rot.get() + (reduce ? 0 : d.vel * 180));
    choose(nearest(projected));
    window.setTimeout(() => (suppressClick.current = false), 0);
  };

  // --- Keyboard -------------------------------------------------------------------
  const onKeyDown = (ev: React.KeyboardEvent) => {
    const fwd = rtl ? "ArrowLeft" : "ArrowRight";
    const back = rtl ? "ArrowRight" : "ArrowLeft";
    let i: number | null = null;
    if (ev.key === fwd || ev.key === "ArrowDown") i = Math.min(events.length - 1, selRef.current + 1);
    else if (ev.key === back || ev.key === "ArrowUp") i = Math.max(0, selRef.current - 1);
    else if (ev.key === "Home") i = 0;
    else if (ev.key === "End") i = events.length - 1;
    if (i === null) return;
    ev.preventDefault();
    choose(i, { focus: true });
  };

  const ticks = useMemo(() => {
    const out: { a: number; long: boolean; now: boolean }[] = [];
    for (let d = startDay; d <= endDay; d++) {
      out.push({ a: angleOf(d), long: (d - startDay) % 7 === 0, now: d === nowDay });
    }
    return out;
  }, [startDay, endDay, nowDay, angleOf]);

  const selected = events[sel];
  const label = dayLabels[Math.min(dayLabels.length - 1, Math.max(0, readDay - startDay))];
  const rel = readDay - nowDay;
  const relText = rel >= 0 ? te("relativeDays", { days: rel }) : te("relativePast", { days: -rel });
  const PrevIcon = rtl ? ChevronRight : ChevronLeft;
  const NextIcon = rtl ? ChevronLeft : ChevronRight;
  const DetailsArrow = rtl ? ArrowLeft : ArrowRight;

  if (events.length === 0) return null;

  return (
    <MotionConfig reducedMotion="user">
      <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:gap-14">
        {/* ---------------- The dial ---------------- */}
        <div className="relative mx-auto w-full max-w-[22rem] pt-6 lg:max-w-[26rem]">
          {/* Fixed pointer (does not rotate) */}
          <div aria-hidden className="absolute inset-x-0 top-0 z-10 mx-auto flex w-fit flex-col items-center">
            <span className="size-2.5 bg-brand-purple" />
            <span className="h-3 w-0.5 bg-brand-purple" />
          </div>

          <div
            ref={dialRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            className="relative aspect-square w-full cursor-grab touch-none overflow-hidden rounded-full select-none active:cursor-grabbing"
            data-testid="season-dial"
          >
            <motion.div className="absolute inset-0" style={{ rotate: rot }}>
              <svg aria-hidden viewBox={`0 0 ${VIEW} ${VIEW}`} className="absolute inset-0 size-full overflow-visible">
                <circle cx={C} cy={C} r={R_TICKS + 4} fill="none" stroke="var(--surface-hover)" strokeWidth={30} />
                {ticks.map(({ a, long, now }, k) => {
                  const rad = (a * Math.PI) / 180;
                  const r1 = R_TICKS - (long ? 10 : 4);
                  const r2 = R_TICKS + (now ? 18 : long ? 10 : 4);
                  return (
                    <line
                      key={k}
                      x1={round2(C + Math.sin(rad) * r1)}
                      y1={round2(C - Math.cos(rad) * r1)}
                      x2={round2(C + Math.sin(rad) * r2)}
                      y2={round2(C - Math.cos(rad) * r2)}
                      stroke={now ? "var(--brand-lilac)" : long ? "var(--fg-faint)" : "var(--border-strong)"}
                      strokeWidth={now ? 2.5 : 1}
                    />
                  );
                })}
                {months.map((m) => {
                  const a = angleOf(m.day);
                  const rad = (a * Math.PI) / 180;
                  const r = R_TICKS - 26;
                  const x = round2(C + Math.sin(rad) * r);
                  const y = round2(C - Math.cos(rad) * r);
                  return (
                    <text
                      key={m.day}
                      x={x}
                      y={y}
                      transform={`rotate(${round2(a)} ${x} ${y})`}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="var(--fg-subtle)"
                      className={rtl ? "font-sans text-[13px]" : "font-pixel text-[10px] tracking-[0.2em] uppercase"}
                    >
                      {m.label}
                    </text>
                  );
                })}
              </svg>

              <ol aria-label={t("dialLabel")} onKeyDown={onKeyDown} className="absolute inset-0">
                {events.map((e, i) => {
                  const rad = (angleOf(e.day) * Math.PI) / 180;
                  const isNext = e.state === "next" || e.state === "live";
                  const isSel = i === sel;
                  return (
                    <li
                      key={e.slug}
                      data-testid="timeline-item"
                      data-state={e.state}
                      data-tentative={e.tentative || undefined}
                      aria-current={isNext ? "true" : undefined}
                      className="absolute size-0"
                      style={{
                        left: `${round2(50 + (Math.sin(rad) * R_NODES * 100) / VIEW)}%`,
                        top: `${round2(50 - (Math.cos(rad) * R_NODES * 100) / VIEW)}%`,
                      }}
                    >
                      <Link
                        ref={(el) => {
                          linkRefs.current[i] = el;
                        }}
                        href={`/events/${e.slug}`}
                        tabIndex={isSel ? 0 : -1}
                        draggable={false}
                        onClick={(ev) => {
                          if (suppressClick.current || i !== selRef.current) {
                            ev.preventDefault();
                            if (!suppressClick.current) choose(i);
                          }
                        }}
                        onFocus={() => i !== selRef.current && choose(i)}
                        className="absolute -top-3 -left-3 grid size-6 place-items-center rounded-[3px] outline-offset-2"
                      >
                        <span
                          aria-hidden
                          className={cn(
                            "block border-2 transition-transform duration-200 ease-[var(--ease-out)]",
                            isSel ? "size-4 scale-110" : "size-3",
                            e.state === "past" && "border-brand-purple-deeper bg-brand-purple-deeper",
                            isNext && "border-brand-lilac bg-brand-purple",
                            e.state === "upcoming" &&
                              (e.tentative ? "border-dashed border-brand-purple-soft bg-bg" : "border-brand-purple-soft bg-bg"),
                          )}
                        />
                        <span className="sr-only">
                          {e.title}, <time dateTime={e.startsAt}>{e.fullDate}</time>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ol>
            </motion.div>

            {/* Center readout (does not rotate). touch-action pan-y so the page still scrolls from here. */}
            <div className="pointer-events-none absolute inset-[24%] grid place-content-center text-center [touch-action:pan-y]">
              <p className="text-xs text-fg-subtle" suppressHydrationWarning>
                {label?.weekday}
              </p>
              <p className="font-mono text-[2.5rem] leading-none font-medium text-fg tabular-nums lg:text-5xl" suppressHydrationWarning>
                <bdi dir="ltr">{label?.shortDate}</bdi>
              </p>
              <p
                className={cn("mt-2 text-sm font-medium", rel === 0 ? "text-brand-lilac" : "text-brand-purple-soft")}
                suppressHydrationWarning
              >
                {relText}
              </p>
            </div>
          </div>
          <p className="mt-3 text-center text-[0.8125rem] text-fg-subtle">{t("dialHint")}</p>
        </div>

        {/* ---------------- Selected meetup ---------------- */}
        <div className="min-w-0">
          <motion.article
            key={selected.slug}
            // First render: already in place (never transparent at load). After that, a short slide-in per change.
            initial={interacted ? { opacity: 0, y: 8 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: dur.ui, ease: [...ease.out] }}
            aria-live="polite"
            className={cn(
              "rounded-lg border bg-surface p-5 shadow-[var(--highlight-top)]",
              selected.state === "next" || selected.state === "live" ? "border-border-accent" : "border-border",
            )}
          >
            <div className="flex flex-wrap items-center gap-1.5">
              {selected.day === nowDay && selected.state !== "past" && <span className="tag tag-next">{te("today")}</span>}
              {selected.state === "live" && <span className="tag tag-next">{te("happeningNow")}</span>}
              {selected.state === "next" && selected.day !== nowDay && <span className="tag tag-next">{te("next")}</span>}
              {selected.state === "past" && <span className="tag">{te("past")}</span>}
              {selected.tentative && <span className="tag tag-tentative">{te("tentative")}</span>}
              {selected.venueTbd && <span className="tag tag-tbd">{te("venueTbd")}</span>}
            </div>
            <h3 className="mt-3 text-[1.375rem] leading-tight font-bold text-balance text-fg">{selected.title}</h3>
            <p className="mt-2 text-fg-muted">
              {selected.fullDate}
              <span aria-hidden className="mx-1.5 text-fg-faint">
                ·
              </span>
              <bdi dir="ltr" className="font-mono text-[0.875rem]">
                {selected.timeRange}
              </bdi>
            </p>
            {selected.who && <p className="mt-1 text-fg-muted">{selected.who}</p>}
            <Link
              href={`/events/${selected.slug}`}
              tabIndex={-1}
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand-purple-soft transition-colors duration-150 hover:text-brand-purple-softer"
            >
              {te("details")}
              <DetailsArrow aria-hidden className="size-4" />
            </Link>
          </motion.article>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => choose(sel - 1)}
              aria-disabled={sel === 0}
              className="btn btn-ghost h-10 px-3 aria-disabled:opacity-40"
            >
              <PrevIcon aria-hidden />
              {t("prevEvent")}
            </button>
            <button
              type="button"
              onClick={() => choose(sel + 1)}
              aria-disabled={sel === events.length - 1}
              className="btn btn-ghost h-10 px-3 aria-disabled:opacity-40"
            >
              {t("nextEventButton")}
              <NextIcon aria-hidden />
            </button>
            {sel !== homeIndex && (
              <button type="button" onClick={() => choose(homeIndex)} className="btn h-10 px-3 text-brand-purple-soft hover:bg-surface-hover">
                <RotateCcw aria-hidden />
                {t("backToNext")}
              </button>
            )}
          </div>
        </div>
      </div>
    </MotionConfig>
  );
}
