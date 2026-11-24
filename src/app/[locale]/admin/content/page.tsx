import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { TEXT_SECTIONS_ENABLED, contentKindOf, sectionsFor } from "@/lib/content/sections";
import { formatEventDate, loc } from "@/lib/event-format";
import { AdminHeader } from "@/components/admin/admin-header";
import { panelClass } from "@/components/admin/styles";
import { cn } from "@/lib/utils";

type Row = {
  id: string;
  slug: string;
  kind: string;
  title_he: string;
  title_en: string;
  starts_at: string;
  status: string;
  event_content: { section: string; status: string }[];
  event_files: { status: string }[];
};

/** Every event with how many of its files are published (or, with text sections on, sections); pick one to edit. */
export default async function AdminContentPage({ params }: PageProps<"/[locale]/admin/content">) {
  const { locale: lc } = await params;
  const l = lc as Locale;
  setRequestLocale(l);
  await requireAdmin("/admin/content");
  const [t, supabase] = await Promise.all([getTranslations("content"), createClient()]);

  const { data } = supabase
    ? await supabase
        .from("events")
        .select("id, slug, kind, title_he, title_en, starts_at, status, event_content(section, status), event_files(status)")
        .order("starts_at", { ascending: true })
    : { data: [] };
  const events = (data ?? []) as Row[];
  const Forward = l === "he" ? ArrowLeft : ArrowRight;

  const group = (kind: "lecture" | "workshop", title: string) => {
    const list = events.filter((e) => contentKindOf(e.kind) === kind);
    if (!list.length) return null;
    return (
      <section aria-labelledby={`content-${kind}`} className="grid gap-3">
        <h2 id={`content-${kind}`} className="text-lg font-bold text-fg">
          {title}
        </h2>
        <ul className={cn(panelClass, "divide-y divide-border")}>
          {list.map((e) => {
            const expected = sectionsFor(kind);
            const published = (e.event_content ?? []).filter((c) => c.status === "published" && (expected as readonly string[]).includes(c.section)).length;
            return (
              <li key={e.id}>
                <Link
                  href={`/admin/content/${e.id}`}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 transition-colors duration-150 hover:bg-surface-hover sm:px-5"
                  data-testid="content-event"
                >
                  <span className="grid min-w-0">
                    <span className="font-semibold text-fg">{loc(e, "title", l) ?? e.slug}</span>
                    <span className="text-sm text-fg-subtle">{formatEventDate(e.starts_at, l)}</span>
                  </span>
                  <span className="inline-flex items-center gap-2 text-sm text-fg-muted">
                    {TEXT_SECTIONS_ENABLED
                      ? t("adminCount", { published, total: expected.length })
                      : t("adminFilesCount", { n: (e.event_files ?? []).filter((f) => f.status === "published").length })}
                    <Forward aria-hidden className="size-4" />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    );
  };

  return (
    <div className="grid gap-8" data-testid="admin-content">
      <AdminHeader title={t("adminTitle")} body={t("adminBody")} />
      {group("lecture", t("adminLectures"))}
      {group("workshop", t("adminWorkshops"))}
    </div>
  );
}
