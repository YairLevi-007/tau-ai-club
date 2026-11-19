import { bidiSegments } from "@/lib/event-format";

/**
 * Renders a title (or any short mixed Hebrew/English text) so English runs keep their own
 * punctuation in a Hebrew line: "Zero to Hero 2: Claude Code, חלק 2 מתוך 3" no longer shows
 * ",Claude Code" (design review item 1, 19.11). English-only text renders exactly as before.
 * Display only: no characters are added, so copying gives the plain title.
 */
export function BidiText({ text }: { text: string }) {
  const segments = bidiSegments(text);
  if (segments.length === 1 && !segments[0].ltr) return text;
  return segments.map((s, i) =>
    s.ltr ? (
      <bdi key={i} dir="ltr">
        {s.text}
      </bdi>
    ) : (
      s.text
    ),
  );
}
