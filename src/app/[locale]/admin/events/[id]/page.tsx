import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requireAdmin } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { loc } from "@/lib/event-format";
import { EVENT_KINDS } from "@/lib/admin/content";
import { utcToWallTime } from "@/lib/wall-time";
import { ActionForm } from "@/components/admin/action-form";
import { inputClass, labelClass, smallBtn } from "@/components/admin/styles";
import { deleteEvent, saveEvent } from "../actions";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/events/[id]">): Promise<Metadata> {
  const { locale, id } = await params;
  const t = await getTranslations({ locale, namespace: "admin" });
  return { title: id === "new" ? t("newEvent") : t("editEvent"), robots: { index: false, follow: false } };
}

type EventRow = {
  id: string;
  slug: string;
  cohort_id: string;
  kind: string;
  series: string | null;
  series_no: number | null;
  title_he: string;
  title_en: string;
  blurb_he: string | null;
  blurb_en: string | null;
  starts_at: string;
  ends_at: string;
  venue_id: string | null;
  venue_note_he: string | null;
  venue_note_en: string | null;
  luma_url: string | null;
  is_tentative: boolean;
  status: "draft" | "published";
  event_speakers: { speaker_id: string; sort: number }[];
};
type Named = { id: string; name_he: string; name_en: string };

const textareaClass = inputClass.replace("h-10", "min-h-24 py-2");
const ltr = `${inputClass} text-start`;

/** Create (id = "new") or edit one event. Times are entered in Israel time. */
export default async function AdminEventPage({ params, searchParams }: PageProps<"/[locale]/admin/events/[id]">) {
  const { locale: l, id } = await params;
  const locale = l as Locale;
  setRequestLocale(locale);
  await requireAdmin(`/admin/events/${id}`);
  const t = await getTranslations("admin");
  const created = (await searchParams).created === "1";

  const supabase = await createClient();
  if (!supabase) notFound();
  const isNew = id === "new";
  if (!isNew && !/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const [eventRes, cohortsRes, venuesRes, speakersRes] = await Promise.all([
    isNew
      ? Promise.resolve({ data: null })
      : supabase
          .from("events")
          .select("*, event_speakers(speaker_id, sort)")
          .eq("id", id)
          .maybeSingle(),
    supabase.from("cohorts").select("id, name_he, name_en, starts_on").order("starts_on", { ascending: false }),
    supabase.from("venues").select("id, name_he, name_en").order("name_en"),
    supabase.from("speakers").select("id, name_he, name_en").order("name_en"),
  ]);
  const ev = eventRes.data as EventRow | null;
  if (!isNew && !ev) notFound();
  const cohorts = (cohortsRes.data ?? []) as Named[];
  const venues = (venuesRes.data ?? []) as Named[];
  const speakers = (speakersRes.data ?? []) as Named[];
  const lineup = [...(ev?.event_speakers ?? [])].sort((a, b) => a.sort - b.sort).map((s) => s.speaker_id);
  const slots = Math.max(4, lineup.length + 1);

  return (
    <div className="grid gap-8">
      <header className="grid gap-2">
        <Link href="/admin/events" className="w-fit text-sm text-fg-muted hover:text-fg">
          {t("backToEvents")}
        </Link>
        <h1 className="text-h2 font-bold">{isNew ? t("newEvent") : loc(ev!, "title", locale)}</h1>
        <p className="max-w-[65ch] text-fg-muted">{t("eventFormBody")}</p>
        {created && (
          <p role="status" className="text-fg-muted">
            {t("added")}
          </p>
        )}
      </header>

      <ActionForm action={saveEvent} className="grid gap-6" key={ev?.id ?? "new"}>
        {ev && <input type="hidden" name="id" value={ev.id} />}

        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-2 text-h3 font-bold">{t("sectionBasics")}</legend>
          <label className={labelClass}>
            {t("titleHe")}
            <input name="title_he" required dir="rtl" lang="he" defaultValue={ev?.title_he ?? ""} className={inputClass} />
          </label>
          <label className={labelClass}>
            {t("titleEn")}
            <input name="title_en" required dir="ltr" lang="en" defaultValue={ev?.title_en ?? ""} className={ltr} />
          </label>
          <label className={labelClass}>
            {t("slug")}
            <input
              name="slug"
              required
              dir="ltr"
              pattern="[a-z0-9-]+"
              defaultValue={ev?.slug ?? ""}
              aria-describedby="slug-hint"
              className={ltr}
            />
            <span id="slug-hint" className="text-xs text-fg-subtle">
              {t("slugHint")}
            </span>
          </label>
          <label className={labelClass}>
            {t("cohort")}
            <select name="cohort_id" required defaultValue={ev?.cohort_id ?? cohorts[0]?.id} className={inputClass}>
              {cohorts.map((c) => (
                <option key={c.id} value={c.id}>
                  {loc(c, "name", locale)}
                </option>
              ))}
            </select>
          </label>
          <label className={labelClass}>
            {t("kind")}
            <select name="kind" defaultValue={ev?.kind ?? "lecture"} className={inputClass}>
              {EVENT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`kind_${k}`)}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-[2fr_1fr] gap-3">
            <label className={labelClass}>
              {t("series")}
              <input name="series" dir="ltr" pattern="[a-z0-9-]*" defaultValue={ev?.series ?? ""} className={ltr} />
            </label>
            <label className={labelClass}>
              {t("seriesNo")}
              <input name="series_no" type="number" min={1} max={99} defaultValue={ev?.series_no ?? ""} className={ltr} />
            </label>
          </div>
          <label className={`${labelClass} sm:col-span-2`}>
            {t("blurbHe")}
            <textarea name="blurb_he" dir="rtl" lang="he" defaultValue={ev?.blurb_he ?? ""} className={textareaClass} />
          </label>
          <label className={`${labelClass} sm:col-span-2`}>
            {t("blurbEn")}
            <textarea name="blurb_en" dir="ltr" lang="en" defaultValue={ev?.blurb_en ?? ""} className={textareaClass} />
          </label>
        </fieldset>

        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-2 text-h3 font-bold">{t("sectionWhen")}</legend>
          <label className={labelClass}>
            {t("startsAt")}
            <input
              name="starts_at"
              type="datetime-local"
              required
              dir="ltr"
              defaultValue={ev ? utcToWallTime(ev.starts_at) : ""}
              className={ltr}
            />
          </label>
          <label className={labelClass}>
            {t("endsAt")}
            <input
              name="ends_at"
              type="datetime-local"
              required
              dir="ltr"
              defaultValue={ev ? utcToWallTime(ev.ends_at) : ""}
              className={ltr}
            />
          </label>
          <p className="text-sm text-fg-subtle sm:col-span-2">{t("timeZoneHint")}</p>
          <label className="flex items-center gap-2 text-sm text-fg sm:col-span-2">
            <input type="checkbox" name="is_tentative" defaultChecked={ev?.is_tentative ?? false} className="size-4 accent-brand-purple" />
            {t("tentativeLabel")}
          </label>
        </fieldset>

        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-2 text-h3 font-bold">{t("sectionWhere")}</legend>
          <label className={`${labelClass} sm:col-span-2`}>
            {t("venue")}
            <select name="venue_id" defaultValue={ev?.venue_id ?? ""} className={inputClass}>
              <option value="">{t("venueTbd")}</option>
              {venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {loc(v, "name", locale)}
                </option>
              ))}
            </select>
          </label>
          <label className={labelClass}>
            {t("venueNoteHe")}
            <input name="venue_note_he" dir="rtl" lang="he" defaultValue={ev?.venue_note_he ?? ""} className={inputClass} />
          </label>
          <label className={labelClass}>
            {t("venueNoteEn")}
            <input name="venue_note_en" dir="ltr" lang="en" defaultValue={ev?.venue_note_en ?? ""} className={ltr} />
          </label>
          <Link href="/admin/venues" className="w-fit text-sm text-brand-purple-soft underline underline-offset-4">
            {t("manageVenues")}
          </Link>
        </fieldset>

        <fieldset className="grid gap-4">
          <legend className="mb-2 text-h3 font-bold">{t("sectionSpeakers")}</legend>
          <p className="text-sm text-fg-subtle">{t("speakersOrderHint")}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: slots }, (_, i) => (
              <label key={i} className={labelClass}>
                {t("speakerSlot", { n: i + 1 })}
                <select name="speaker_id" defaultValue={lineup[i] ?? ""} className={inputClass}>
                  <option value="">{t("noSpeaker")}</option>
                  {speakers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {loc(s, "name", locale)}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <Link href="/admin/speaker-profiles" className="w-fit text-sm text-brand-purple-soft underline underline-offset-4">
            {t("manageSpeakers")}
          </Link>
        </fieldset>

        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-2 text-h3 font-bold">{t("sectionPublish")}</legend>
          <label className={`${labelClass} sm:col-span-2`}>
            {t("lumaUrl")}
            <input
              name="luma_url"
              type="url"
              dir="ltr"
              placeholder="https://luma.com/…"
              pattern="https://.+"
              defaultValue={ev?.luma_url ?? ""}
              className={ltr}
            />
          </label>
          <label className={labelClass}>
            {t("status")}
            <select name="status" defaultValue={ev?.status ?? "draft"} className={inputClass}>
              <option value="draft">{t("statusDraft")}</option>
              <option value="published">{t("statusPublished")}</option>
            </select>
          </label>
        </fieldset>

        <div className="flex flex-wrap gap-3">
          <button type="submit" className="btn btn-primary h-10 px-5 text-sm">
            {isNew ? t("createEvent") : t("save")}
          </button>
          {ev?.status === "published" && (
            <Link href={`/events/${ev.slug}`} className={smallBtn}>
              {t("viewEvent")}
            </Link>
          )}
        </div>
      </ActionForm>

      {ev && (
        <ActionForm action={deleteEvent} confirmText={t("deleteEventConfirm", { name: loc(ev, "title", locale) ?? ev.slug })} className="border-t border-border pt-6">
          <input type="hidden" name="id" value={ev.id} />
          <button type="submit" className={`${smallBtn} text-destructive`}>
            {t("deleteEvent")}
          </button>
        </ActionForm>
      )}
    </div>
  );
}
