import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requireAdmin } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { formatShortDate, formatTimeRange, loc } from "@/lib/event-format";
import { smallBtn } from "@/components/admin/styles";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/events">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin" });
  return { title: t("eventsTitle"), robots: { index: false, follow: false } };
}

type Row = {
  id: string;
  slug: string;
  title_he: string;
  title_en: string;
  starts_at: string;
  ends_at: string;
  status: "draft" | "published";
  is_tentative: boolean;
  venue: { name_he: string; name_en: string } | null;
  event_speakers: { speaker_id: string }[];
};

/** Every event, drafts included (admins pass the "admins manage events" policy). */
export default async function AdminEventsPage({ params }: PageProps<"/[locale]/admin/events">) {
  const { locale: l } = await params;
  const locale = l as Locale;
  setRequestLocale(locale);
  await requireAdmin("/admin/events");
  const t = await getTranslations("admin");

  const supabase = await createClient();
  const { data, error } = supabase
    ? await supabase
        .from("events")
        .select("id, slug, title_he, title_en, starts_at, ends_at, status, is_tentative, venue:venues(name_he, name_en), event_speakers(speaker_id)")
        .order("starts_at")
    : { data: [], error: null };
  const rows = (data ?? []) as unknown as Row[];

  return (
    <div className="grid gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-2">
          <h1 className="text-h2 font-bold">{t("eventsTitle")}</h1>
          <p className="max-w-[65ch] text-fg-muted">{t("eventsBody")}</p>
        </div>
        <Link href="/admin/events/new" className="btn btn-primary h-10 px-4 text-sm">
          {t("newEvent")}
        </Link>
      </header>
      {error && (
        <p role="alert" className="text-destructive">
          {t("errorGeneric")}
        </p>
      )}

      {rows.length === 0 && !error ? (
        <p className="text-fg-muted">{t("noEvents")}</p>
      ) : (
        <ul className="grid gap-3" data-testid="admin-events">
          {rows.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-surface p-4">
              <div className="grid gap-1">
                <p className="font-bold">{loc(e, "title", locale)}</p>
                <p className="text-sm text-fg-muted">
                  <bdi>{formatShortDate(e.starts_at, locale)}</bdi> · <bdi dir="ltr">{formatTimeRange(e.starts_at, e.ends_at)}</bdi> ·{" "}
                  {e.venue ? loc(e.venue, "name", locale) : t("venueTbd")} · {t("speakerCount", { n: e.event_speakers.length })}
                </p>
                <p className="flex flex-wrap gap-2 text-sm">
                  <span className={e.status === "published" ? "tag tag-next" : "tag"}>
                    {e.status === "published" ? t("statusPublished") : t("statusDraft")}
                  </span>
                  {e.is_tentative && <span className="tag tag-tentative">{t("tentative")}</span>}
                  <bdi dir="ltr" className="text-fg-subtle">
                    /{e.slug}
                  </bdi>
                </p>
              </div>
              <Link href={`/admin/events/${e.id}`} className={smallBtn}>
                {t("edit")}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
