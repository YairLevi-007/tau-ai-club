import { Link } from "@/i18n/navigation";
import type { EventFile } from "@/lib/content/sections";
import { FileTiles as Tiles, type T } from "./file-tiles";

export type { FileKey } from "./file-tiles";

/**
 * The member files on a lecture or workshop page, as tiles with a tab (see file-tiles.tsx). An
 * interactive lesson opens through the locale-aware Link (/lessons/<id>, or /en/lessons/<id>).
 */
export function FileTiles(props: { files: EventFile[]; locale: string; t: T }) {
  return <Tiles {...props} LessonLink={Link} />;
}
