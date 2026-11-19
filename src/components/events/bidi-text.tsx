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
  let offset = 0;
  return segments.map((s, i) => {
    const content = styled(s.text, offset, marks);
    offset += s.text.length;
    return s.ltr ? (
      <bdi key={i} dir="ltr">
        {content}
      </bdi>
    ) : (
      <Fragment key={i}>{content}</Fragment>
    );
  });
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
