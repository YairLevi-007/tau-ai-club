import type { ComponentType, ReactNode } from "react";
import type { EventFile } from "@/lib/content/sections";
import { cn } from "@/lib/utils";

/**
 * The member files on a lecture or workshop page, as tiles with a tab (DECISIONS 25.11, option A
 * in files-look): a PDF summary reads as something to download, an interactive lesson as something
 * to open and play. A PDF downloads through /api/files (a short-lived signed URL); a lesson opens
 * on the site, at /lessons/<id> (a sandboxed frame).
 *
 * The whole tile is one link. Its accessible name is the full sentence ("הורדת …" / "שיעור
 * אינטראקטיבי: …"), so a screen reader hears one clear action, not the tab, title and button apart.
 * Works in both server and client components (no hooks). The lesson link component is passed in
 * (file-link.tsx gives it the locale-aware Link), so this file has no Next imports and tests can
 * render it on its own.
 */
export type FileKey = "download" | "openLesson" | "fileTabPdf" | "fileTabLesson" | "fileMetaPdf" | "fileMetaLesson" | "fileCtaPdf" | "fileCtaLesson";
export type T = (key: FileKey, values?: { title: string }) => string;
export type LinkLike = "a" | ComponentType<{ href: string; className?: string; "aria-label"?: string; "data-testid"?: string; children?: ReactNode }>;

// Pixel glyphs on the logo's grid, like the home page's card icons: "#" lit (brand purple), "+" dim.
const GLYPHS = {
  // A page with lines of text: the summary.
  pdf: [".######..", ".#....##.", ".#.....#.", ".#+++++#.", ".#.....#.", ".#++++.#.", ".#.....#.", ".#+++..#.", ".#######."],
  // A screen with a play sign: the interactive lesson.
  lesson: ["+++++++++", "+.......+", "+..#....+", "+..##...+", "+..###..+", "+..##...+", "+..#....+", "+.......+", "+++++++++"],
} as const;

function Glyph({ kind }: { kind: keyof typeof GLYPHS }) {
  const rows = GLYPHS[kind];
  return (
    <svg aria-hidden viewBox={`0 0 ${rows[0].length} ${rows.length}`} shapeRendering="crispEdges" className="block size-11 shrink-0">
      {rows.flatMap((row, y) =>
        [...row].map((c, x) =>
          c === "." ? null : (
            <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={c === "#" ? "var(--brand-purple)" : "var(--logo-block)"} />
          ),
        ),
      )}
    </svg>
  );
}

export function FileTiles({ files, locale, t, LessonLink }: { files: EventFile[]; locale: string; t: T; LessonLink: LinkLike }) {
  return (
    <ul className="mt-10 grid gap-x-4 gap-y-10 sm:grid-cols-2" data-testid="file-tiles">
      {files.map((f) => (
        <li key={f.id} className="min-w-0">
          <FileTile file={f} title={locale === "en" ? f.title_en : f.title_he} locale={locale} t={t} LessonLink={LessonLink} />
        </li>
      ))}
    </ul>
  );
}

function FileTile({ file, title, locale, t, LessonLink }: { file: EventFile; title: string; locale: string; t: T; LessonLink: LinkLike }) {
  const lesson = file.kind === "lesson";
  const en = locale === "en";
  const body = (
    <>
      {/* The tab: a folder tab on the tile's start corner, reaching 1px over the tile's top border so the
          two read as one piece. Pixel caps in English, Plex in Hebrew. */}
      <span
        aria-hidden
        className={cn(
          "absolute top-px -start-px inline-flex -translate-y-full items-center gap-1.5 rounded-t-md border border-b-0 px-3 pt-1 pb-0.5 leading-[1.4]",
          en ? "font-pixel text-[0.625rem] tracking-[0.16em] uppercase" : "text-[0.8125rem] font-medium",
          lesson ? "border-brand-purple bg-brand-purple text-fg" : "border-border-strong bg-bg-raised text-fg-muted",
        )}
      >
        <span className="size-1.5 bg-current" />
        {t(lesson ? "fileTabLesson" : "fileTabPdf")}
      </span>
      <span className="flex min-w-0 items-center gap-4">
        <Glyph kind={lesson ? "lesson" : "pdf"} />
        <span className="grid min-w-0 gap-1">
          <span className="text-[1.1875rem] leading-tight font-semibold break-words text-fg">{title}</span>
          <span className={cn("text-sm", lesson ? "text-brand-purple-soft" : "text-fg-subtle")}>{t(lesson ? "fileMetaLesson" : "fileMetaPdf")}</span>
        </span>
      </span>
      <span
        className={cn(
          "inline-flex h-11 w-full items-center justify-center gap-2 rounded-md border px-4 text-[0.9375rem] font-semibold transition-colors sm:w-fit sm:justify-self-start",
          lesson
            ? "border-brand-purple bg-brand-purple text-fg group-hover:bg-brand-purple-deeper"
            : "border-border-strong text-fg group-hover:border-brand-purple",
        )}
      >
        {lesson ? (
          // A play sign points the same way in both languages: never mirrored.
          <svg aria-hidden viewBox="0 0 12 12" className="size-3" fill="currentColor">
            <path d="M2 1h2v1h2v1h2v1h2v1h1v2h-1v1H8v1H6v1H4v1H2z" />
          </svg>
        ) : (
          <svg aria-hidden viewBox="0 0 16 16" className="size-4" fill="currentColor">
            <path d="M7 2h2v8h2v2H9v2H7v-2H5v-2h2z" />
          </svg>
        )}
        {t(lesson ? "fileCtaLesson" : "fileCtaPdf")}
      </span>
    </>
  );
  const tile = cn(
    "group relative grid gap-4 border p-5 shadow-[var(--highlight-top)] transition-colors",
    "rounded-se-lg rounded-ee-lg rounded-es-lg", // square start-top corner: the tab sits there
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-purple",
    lesson
      ? "border-brand-purple bg-[linear-gradient(160deg,color-mix(in_oklab,var(--brand-purple)_22%,var(--bg-raised)),var(--bg-raised)_70%)]"
      : "border-border-strong bg-bg-raised hover:border-brand-purple/60",
  );

  if (lesson) {
    const name = t("openLesson", { title });
    return (
      <LessonLink href={`/lessons/${file.id}`} aria-label={name} className={tile} data-testid="lesson-open">
        {body}
      </LessonLink>
    );
  }
  const name = t("download", { title });
  return (
    <a href={`/api/files/${file.id}`} aria-label={name} className={tile} data-testid="file-download">
      {body}
    </a>
  );
}
