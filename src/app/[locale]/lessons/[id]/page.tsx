import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { routing, type Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { authEnabled } from "@/lib/supabase/config";
import { requireMember } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { contentKindOf } from "@/lib/content/sections";
import { BidiText } from "@/components/events/bidi-text";
import { LessonFrame } from "@/components/content/lesson-frame";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: PageProps<"/[locale]/lessons/[id]">): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  // Members only: a generic title, so nothing about the lesson reaches the metadata.
  const t = await getTranslations({ locale, namespace: "content" });
  return { title: t("lessonMetaTitle"), robots: { index: false, follow: false } };
}

/**
 * An interactive HTML lesson (Ido's quizzes), members only. The page is ours; the lesson runs in
 * a sandboxed frame from /api/lessons/<id> and never gets the site's origin, cookies or session.
 */
export default async function LessonPage({ params }: PageProps<"/[locale]/lessons/[id]">) {
  const { locale: lc, id } = await params;
  if (!hasLocale(routing.locales, lc)) notFound();
  const locale = lc as Locale;
  setRequestLocale(locale);
  if (!authEnabled() || !UUID.test(id)) notFound();
  await requireMember(`/lessons/${id}`);
  const supabase = await createClient();
  if (!supabase) notFound();
  // RLS returns the row only to members, and only while it and its event are published.
  const { data: file } = await supabase
    .from("event_files")
    .select("id, title_he, title_en, kind, events(slug, kind)")
    .eq("id", id)
    .eq("status", "published")
    .eq("kind", "lesson")
    .maybeSingle();
  if (!file) notFound();

  const t = await getTranslations("content");
  const event = (Array.isArray(file.events) ? file.events[0] : file.events) as { slug: string; kind: string } | null;
  const title = (locale === "en" ? file.title_en : file.title_he) || file.title_he;
  const back = event ? (contentKindOf(event.kind) === "workshop" ? `/workshops/${event.slug}` : `/lectures/${event.slug}`) : "/learn";
  const Back = locale === "he" ? ChevronRight : ChevronLeft;

  return (
    <div className="mx-auto grid max-w-site gap-4 px-4 pt-6 pb-10 sm:px-8" data-testid="lesson-page">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="grid min-w-0 gap-1">
          <Link href={back} className="inline-flex w-fit items-center gap-1 rounded-sm text-sm text-fg-muted hover:text-fg" data-testid="lesson-back">
            <Back aria-hidden className="size-4" />
            {t("lessonBack")}
          </Link>
          <h1 className="text-xl leading-snug font-bold text-balance text-fg sm:text-2xl">
            <BidiText text={title} />
          </h1>
        </div>
        <p className="text-sm text-fg-subtle">{t("lessonSaved")}</p>
      </div>
      <LessonFrame id={file.id} title={t("lessonFrameTitle", { title })} />
    </div>
  );
}
