import { Fragment } from "react";

/**
 * "Year 3 · Faculty · Program", each part isolated in its own <bdi>. Members type these freely,
 * and a Latin part like "B.Sc." inside Hebrew text otherwise drags its period (and the
 * separators) to the wrong side. Each part is also its own inline block, so a line breaks between
 * parts, never inside one: a Hebrew faculty name split across two lines of an English page read
 * in a jumbled order (round 2, item 5).
 */
export function ProfileSubline({ parts, className }: { parts: (string | null | undefined)[]; className?: string }) {
  const shown = parts.filter((p): p is string => Boolean(p));
  if (shown.length === 0) return null;
  return (
    <p className={className}>
      {shown.map((p, i) => (
        <Fragment key={i}>
          {i > 0 && " · "}
          <bdi className="inline-block">{p}</bdi>
        </Fragment>
      ))}
    </p>
  );
}
