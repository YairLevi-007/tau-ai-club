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
import { AdminHeader } from "@/components/admin/admin-header";
import { cn } from "@/lib/utils";
import { ArrowLeft, CircleCheck } from "lucide-react";
import { ActionForm } from "@/components/admin/action-form";
import { SpeakerContactsPanel, type SpeakerContactStatus } from "@/components/admin/speaker-contacts-panel";
import { dangerBtn, inputClass, labelClass, panelClass, smallBtn } from "@/components/admin/styles";
import { deleteEvent, saveEvent } from "../actions";
import { FlyerImport } from "@/components/admin/flyer/flyer-import";
import { decodePrefill } from "@/lib/flyer/prefill";
import { ScanText } from "lucide-react";

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
  const sp = await searchParams;
  const created = sp.created === "1";
  const prefillParam = typeof sp.prefill === "string" ? sp.prefill : null;

  const supabase = await createClient();
  if (!supabase) notFound();
  const isNew = id === "new";
  if (!isNew && !/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const [eventRes, cohortsRes, venuesRes, speakersRes, contactsRes] = await Promise.all([
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
    isNew ? Promise.resolve({ data: [] }) : supabase.rpc("admin_speaker_contact_status"),
  ]);
  const ev = eventRes.data as EventRow | null;
  if (!isNew && !ev) notFound();
  const cohorts = (cohortsRes.data ?? []) as Named[];
  const venues = (venuesRes.data ?? []) as Named[];
  const speakers = (speakersRes.data ?? []) as Named[];
  // A draft carried over from the Luma/flyer import (new events only). Never sets the status.
  const pf = isNew ? decodePrefill(prefillParam) : null;
  if (pf) {
    // Drop ids that don't exist (or were deleted since), so the form never points at nothing.
    pf.speaker_ids = pf.speaker_ids.filter((sid) => speakers.some((s) => s.id === sid));
    if (pf.venue_id && !venues.some((v) => v.id === pf.venue_id)) pf.venue_id = "";
  }
  // Fields the import filled: marked on the form (a text tag and a purple outline) for review.
  const imported = new Set(pf?.filled ?? []);
  const hl = (name: string, cls: string) => (imported.has(name) ? `${cls} border-brand-purple` : cls);
  const lab = (text: string, name: string) =>
    imported.has(name) ? (
      <span className="flex flex-wrap items-center gap-x-2">
        {text}
        <span className="text-xs font-normal text-brand-purple-soft" data-testid="imported-tag">
          {t("importedTag")}
        </span>
      </span>
    ) : (
      text
    );
  const lineup = ev ? [...ev.event_speakers].sort((a, b) => a.sort - b.sort).map((s) => s.speaker_id) : (pf?.speaker_ids ?? []);
  const slots = Math.max(4, lineup.length + 1);
  const contactById = new Map(((contactsRes.data ?? []) as SpeakerContactStatus[]).map((r) => [r.speaker_id, r]));
  const lineupContacts = lineup.map((sid) => contactById.get(sid)).filter((r): r is SpeakerContactStatus => !!r);

  return (
    <div className="grid gap-8">
      <AdminHeader
        before={
          <Link href="/admin/events" className="inline-flex w-fit items-center gap-1.5 text-sm text-fg-muted transition-colors duration-150 hover:text-fg">
            <ArrowLeft aria-hidden className="size-4 rtl:-scale-x-100" />
            {t("backToEvents")}
          </Link>
        }
        title={isNew ? t("newEvent") : loc(ev!, "title", locale)}
        body={t("eventFormBody")}
        meta={
          created ? (
            <span role="status" className="inline-flex items-center gap-1.5 text-brand-purple-soft">
              <CircleCheck aria-hidden className="size-4" />
              {t("added")}
            </span>
          ) : null
        }
      />

      {isNew && (
        <FlyerImport speakers={speakers} venues={venues} />
      )}

      {pf && (
        <div role="status" className="grid gap-1 rounded-lg border border-border-accent bg-surface p-4 text-sm" data-testid="flyer-prefilled">
          <p className="flex items-center gap-2 font-semibold text-fg">
            <ScanText aria-hidden className="size-4 text-brand-purple-soft" />
            {t("flyerPrefilled")}
          </p>
          {pf.notes && <p className="text-fg-muted">{pf.notes}</p>}
        </div>
      )}

      <ActionForm action={saveEvent} className="grid gap-6" key={ev?.id ?? (prefillParam ? `prefill-${prefillParam.slice(-24)}` : "new")}>
        {ev && <input type="hidden" name="id" value={ev.id} />}

        <fieldset className={cn(panelClass, "grid gap-4 p-4 sm:grid-cols-2 sm:p-6")}>
          <legend className="float-start mb-1 w-full text-lg font-bold text-fg sm:col-span-2">{t("sectionBasics")}</legend>
          <label className={labelClass}>
            {lab(t("titleHe"), "title_he")}
            <input name="title_he" required dir="rtl" lang="he" defaultValue={ev?.title_he ?? pf?.title_he ?? ""} className={hl("title_he", inputClass)} />
          </label>
          <label className={labelClass}>
            {lab(t("titleEn"), "title_en")}
            <input name="title_en" required dir="ltr" lang="en" defaultValue={ev?.title_en ?? pf?.title_en ?? ""} className={hl("title_en", ltr)} />
          </label>
          <label className={labelClass}>
            {t("slug")}
            <input
              name="slug"
              required
              dir="ltr"
              pattern="[a-z0-9-]+"
              defaultValue={ev?.slug ?? pf?.slug ?? ""}
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
            {lab(t("kind"), "kind")}
            <select name="kind" defaultValue={ev?.kind ?? pf?.kind ?? "lecture"} className={hl("kind", inputClass)}>
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
              <input name="series" dir="ltr" pattern="[a-z0-9-]*" defaultValue={ev?.series ?? pf?.series ?? ""} className={ltr} />
            </label>
            <label className={labelClass}>
              {t("seriesNo")}
              <input name="series_no" type="number" min={1} max={99} defaultValue={ev?.series_no ?? pf?.series_no ?? ""} className={ltr} />
            </label>
          </div>
          <label className={`${labelClass} sm:col-span-2`}>
            {lab(t("blurbHe"), "blurb_he")}
            <textarea name="blurb_he" dir="rtl" lang="he" defaultValue={ev?.blurb_he ?? pf?.blurb_he ?? ""} className={hl("blurb_he", textareaClass)} />
          </label>
          <label className={`${labelClass} sm:col-span-2`}>
            {lab(t("blurbEn"), "blurb_en")}
            <textarea name="blurb_en" dir="ltr" lang="en" defaultValue={ev?.blurb_en ?? pf?.blurb_en ?? ""} className={hl("blurb_en", textareaClass)} />
          </label>
        </fieldset>

        <fieldset className={cn(panelClass, "grid gap-4 p-4 sm:grid-cols-2 sm:p-6")}>
          <legend className="float-start mb-1 w-full text-lg font-bold text-fg sm:col-span-2">{t("sectionWhen")}</legend>
          <label className={labelClass}>
            {lab(t("startsAt"), "starts_at")}
            <input
              name="starts_at"
              type="datetime-local"
              required
              dir="ltr"
              defaultValue={ev ? utcToWallTime(ev.starts_at) : (pf?.starts_at ?? "")}
              className={hl("starts_at", ltr)}
            />
          </label>
          <label className={labelClass}>
            {lab(t("endsAt"), "ends_at")}
            <input
              name="ends_at"
              type="datetime-local"
              required
              dir="ltr"
              defaultValue={ev ? utcToWallTime(ev.ends_at) : (pf?.ends_at ?? "")}
              className={hl("ends_at", ltr)}
            />
          </label>
          <p className="text-sm text-fg-subtle sm:col-span-2">{t("timeZoneHint")}</p>
          <label className="flex items-center gap-2 text-sm text-fg sm:col-span-2">
            <input type="checkbox" name="is_tentative" defaultChecked={ev?.is_tentative ?? false} className="size-4 accent-brand-purple" />
            {t("tentativeLabel")}
          </label>
        </fieldset>

        <fieldset className={cn(panelClass, "grid gap-4 p-4 sm:grid-cols-2 sm:p-6")}>
          <legend className="float-start mb-1 w-full text-lg font-bold text-fg sm:col-span-2">{t("sectionWhere")}</legend>
          <label className={`${labelClass} sm:col-span-2`}>
            {lab(t("venue"), "venue_id")}
            <select name="venue_id" defaultValue={ev?.venue_id ?? pf?.venue_id ?? ""} className={hl("venue_id", inputClass)}>
              <option value="">{t("venueTbd")}</option>
              {venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {loc(v, "name", locale)}
                </option>
              ))}
            </select>
          </label>
          <label className={labelClass}>
            {lab(t("venueNoteHe"), "venue_note_he")}
            <input name="venue_note_he" dir="rtl" lang="he" defaultValue={ev?.venue_note_he ?? pf?.venue_note_he ?? ""} className={hl("venue_note_he", inputClass)} />
          </label>
          <label className={labelClass}>
            {lab(t("venueNoteEn"), "venue_note_en")}
            <input name="venue_note_en" dir="ltr" lang="en" defaultValue={ev?.venue_note_en ?? pf?.venue_note_en ?? ""} className={hl("venue_note_en", ltr)} />
          </label>
          <Link href="/admin/venues" className="w-fit text-sm text-brand-purple-soft underline underline-offset-4">
            {t("manageVenues")}
          </Link>
        </fieldset>

        <fieldset className={cn(panelClass, "grid gap-4 p-4 sm:p-6")}>
          <legend className="float-start mb-1 w-full text-lg font-bold text-fg sm:col-span-2">{t("sectionSpeakers")}</legend>
          <p className="text-sm text-fg-subtle">{t("speakersOrderHint")}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: slots }, (_, i) => (
              <label key={i} className={labelClass}>
                {i < lineup.length ? lab(t("speakerSlot", { n: i + 1 }), "speaker_id") : t("speakerSlot", { n: i + 1 })}
                <select name="speaker_id" defaultValue={lineup[i] ?? ""} className={i < lineup.length ? hl("speaker_id", inputClass) : inputClass}>
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

        <fieldset className={cn(panelClass, "grid gap-4 p-4 sm:grid-cols-2 sm:p-6")}>
          <legend className="float-start mb-1 w-full text-lg font-bold text-fg sm:col-span-2">{t("sectionPublish")}</legend>
          <label className={`${labelClass} sm:col-span-2`}>
            {lab(t("lumaUrl"), "luma_url")}
            <input
              name="luma_url"
              type="url"
              dir="ltr"
              placeholder="https://luma.com/…"
              pattern="https://.+"
              defaultValue={ev?.luma_url ?? pf?.luma_url ?? ""}
              className={hl("luma_url", ltr)}
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
          <button type="submit" className="btn btn-primary h-10 w-full px-6 text-sm sm:w-fit">
            {isNew ? t("createEvent") : t("save")}
          </button>
          {ev?.status === "published" && (
            <Link href={`/events/${ev.slug}`} className={smallBtn}>
              {t("viewEvent")}
            </Link>
          )}
        </div>
      </ActionForm>

      {ev && <SpeakerContactsPanel rows={lineupContacts} locale={locale} />}

      {ev && (
        <ActionForm action={deleteEvent} confirmText={t("deleteEventConfirm", { name: loc(ev, "title", locale) ?? ev.slug })} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 p-4 sm:p-5">
          <input type="hidden" name="id" value={ev.id} />
          <button type="submit" className={dangerBtn}>
            {t("deleteEvent")}
          </button>
        </ActionForm>
      )}
    </div>
  );
}
