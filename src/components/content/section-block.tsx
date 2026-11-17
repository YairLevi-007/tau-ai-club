import { Languages } from "lucide-react";
import type { ContentSection } from "@/lib/content/sections";
import { MarkdownBody } from "./markdown-body";

/**
 * One titled section of a lecture or workshop page. When the English text is missing,
 * the Hebrew original is shown with a "Hebrew only for now" note (never a machine
 * translation), in Hebrew direction. Safe in server and client components.
 */
export function SectionBlock({
  section,
  title,
  body,
  hebrewOnly,
  children,
}: {
  section: ContentSection | "files";
  title: string;
  body?: { text: string; lang: "he" | "en"; fallback: boolean };
  hebrewOnly: { label: string; hint: string };
  children?: React.ReactNode;
}) {
  const showNote = body?.fallback && body.lang === "he";
  return (
    <section aria-labelledby={`section-${section}`} data-testid={`section-${section}`} className="scroll-mt-24">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 id={`section-${section}`} className="text-2xl font-bold text-balance text-fg">
          {title}
        </h2>
        {showNote && (
          <span
            className="inline-flex items-center gap-1.5 rounded-sm border border-border px-2 py-0.5 text-xs font-medium text-fg-muted"
            data-testid="hebrew-only"
          >
            <Languages aria-hidden className="size-3.5" />
            {hebrewOnly.label}
          </span>
        )}
      </div>
      {showNote && <p className="mt-2 text-sm text-fg-subtle">{hebrewOnly.hint}</p>}
      {body && <MarkdownBody source={body.text} lang={body.fallback ? body.lang : undefined} className="mt-4" />}
      {children}
    </section>
  );
}
