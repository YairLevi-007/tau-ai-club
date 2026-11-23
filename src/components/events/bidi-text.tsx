import { Fragment, type ReactNode } from "react";
import { bidiSegments } from "@/lib/event-format";

/** A styled range of `text` (character offsets, end exclusive), e.g. a title's purple accent. */
export type BidiMark = { start: number; end: number; className: string };

/**
 * Renders a title (or any short mixed Hebrew/English text) so English runs keep their own
 * punctuation in a Hebrew line: "Zero to Hero 2: Claude Code, חלק 2 מתוך 3" no longer shows
 * ",Claude Code" (design review item 1, 19.11). English-only text renders exactly as before.
 * Display only: no characters are added, so copying gives the plain title.
 *
 * `marks` style parts of the text without splitting its English runs: "Zero to Hero 2: Claude
 * Code," stays one left-to-right run even when "Claude Code, …" is the purple accent. Rendering
 * the head and the accent as two separate pieces would make them two runs, and a line holding
 * both then shows "Claude Code, Zero to Hero 2:" (round 2, 19.11).
 */
export function BidiText({
  text,
  context,
  marks,
}: {
  text: string;
  /** The whole title, when `text` is a piece of it. */
  context?: string;
  marks?: BidiMark[];
}) {
  const segments = bidiSegments(text, context);
  if (!marks?.length && segments.length === 1 && !segments[0].ltr) return text;
  // Offsets of each segment in the whole text.
  const starts = segments.map((_, i) => segments.slice(0, i).reduce((n, s) => n + s.text.length, 0));
  const out: ReactNode[] = [];
  const glued = new Set<number>();
  segments.forEach((s, i) => {
    const offset = starts[i];
    if (!s.ltr) {
      // An English run ending in punctuation ("Corporate,") must not open a line: in a Hebrew line
      // its comma would then be the first glyph. So the Hebrew word before it is kept on its line
      // (no-wrap around "word + space + run"). No characters are added.
      const next = segments[i + 1];
      const tail = next?.ltr && /[.,:;!?]$/.test(next.text) ? /\S+\s+$/.exec(s.text) : null;
      if (!tail) {
        out.push(<Fragment key={i}>{styled(s.text, offset, marks)}</Fragment>);
        return;
      }
      out.push(<Fragment key={i}>{styled(s.text.slice(0, tail.index), offset, marks)}</Fragment>);
      out.push(
        <span key={`${i}+`} className="whitespace-nowrap">
          {styled(s.text.slice(tail.index), offset + tail.index, marks)}
          <bdi dir="ltr">{styled(next.text, starts[i + 1], marks)}</bdi>
        </span>,
      );
      glued.add(i + 1);
      return;
    }
    if (glued.has(i)) return;
    out.push(
      <bdi key={i} dir="ltr">
        {styled(s.text, offset, marks)}
      </bdi>,
    );
  });
  return out;
}

/** Cuts one segment (starting at `offset` in the whole text) at the marks' edges and wraps the marked parts. */
function styled(text: string, offset: number, marks?: BidiMark[]): ReactNode {
  if (!marks?.length) return text;
  const cuts = new Set([0, text.length]);
  for (const m of marks) {
    for (const p of [m.start - offset, m.end - offset]) if (p > 0 && p < text.length) cuts.add(p);
  }
  const points = [...cuts].sort((a, b) => a - b);
  return points.slice(0, -1).map((p, j) => {
    const q = points[j + 1];
    const part = text.slice(p, q);
    const mark = marks.find((m) => offset + p >= m.start && offset + q <= m.end);
    return mark ? (
      <span key={j} className={mark.className}>
        {part}
      </span>
    ) : (
      <Fragment key={j}>{part}</Fragment>
    );
  });
}
