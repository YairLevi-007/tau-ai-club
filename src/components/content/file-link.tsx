import { Download, MonitorPlay } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { EventFile } from "@/lib/content/sections";

/**
 * One member file on a lecture or workshop page: a PDF downloads through /api/files (a short-lived
 * signed URL); an interactive lesson opens on the site, at /lessons/<id> (a sandboxed frame).
 */
export function FileLink({ file, labels }: { file: EventFile; labels: { download: string; openLesson: string } }) {
  if (file.kind === "lesson") {
    return (
      <Link href={`/lessons/${file.id}`} className="btn btn-ghost w-full justify-start sm:w-fit" data-testid="lesson-open">
        <MonitorPlay aria-hidden className="size-4" />
        {labels.openLesson}
      </Link>
    );
  }
  return (
    <a href={`/api/files/${file.id}`} className="btn btn-ghost w-full justify-start sm:w-fit" data-testid="file-download">
      <Download aria-hidden className="size-4" />
      {labels.download}
    </a>
  );
}
