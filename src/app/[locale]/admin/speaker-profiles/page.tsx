import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { requireAdmin } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { loc } from "@/lib/event-format";
import { ActionForm } from "@/components/admin/action-form";
import { inputClass, labelClass, smallBtn } from "@/components/admin/styles";
import { deleteSpeaker, saveSpeaker } from "./actions";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/speaker-profiles">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin" });
  return { title: t("speakerProfilesTitle"), robots: { index: false, follow: false } };
}

type Speaker = {
  id: string;
  slug: string;
  name_he: string;
  name_en: string;
  company_he: string | null;
  company_en: string | null;
  role_he: string | null;
  role_en: string | null;
  bio_he: string | null;
  bio_en: string | null;
  photo_url: string | null;
  event_speakers: { event_id: string }[];
};

const ltr = `${inputClass} text-start`;
const textareaClass = inputClass.replace("h-10", "min-h-24 py-2");

async function SpeakerFields({ speaker }: { speaker?: Speaker }) {
  const t = await getTranslations("admin");
  const pair = (field: "name" | "company" | "role", required = false) => (
    <>
      <label className={labelClass}>
        {t(`${field}He`)}
        <input name={`${field}_he`} required={required} dir="rtl" lang="he" defaultValue={speaker?.[`${field}_he`] ?? ""} className={inputClass} />
      </label>
      <label className={labelClass}>
        {t(`${field}En`)}
        <input name={`${field}_en`} required={required} dir="ltr" lang="en" defaultValue={speaker?.[`${field}_en`] ?? ""} className={ltr} />
      </label>
    </>
  );
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {speaker && <input type="hidden" name="id" value={speaker.id} />}
      {pair("name", true)}
      {pair("company")}
      {pair("role")}
      <label className={labelClass}>
        {t("bioHe")}
        <textarea name="bio_he" dir="rtl" lang="he" defaultValue={speaker?.bio_he ?? ""} className={textareaClass} />
      </label>
      <label className={labelClass}>
        {t("bioEn")}
        <textarea name="bio_en" dir="ltr" lang="en" defaultValue={speaker?.bio_en ?? ""} className={textareaClass} />
      </label>
      <label className={labelClass}>
        {t("slug")}
        <input name="slug" required dir="ltr" pattern="[a-z0-9-]+" defaultValue={speaker?.slug ?? ""} className={ltr} />
      </label>
      <label className={labelClass}>
        {t("photoUrl")}
        <input name="photo_url" type="url" dir="ltr" pattern="https://.+" defaultValue={speaker?.photo_url ?? ""} className={ltr} />
      </label>
    </div>
  );
}

/** Public speaker profiles (name, company, role, bio, photo). No contact data here. */
export default async function AdminSpeakerProfilesPage({ params }: PageProps<"/[locale]/admin/speaker-profiles">) {
  const { locale: l } = await params;
  const locale = l as Locale;
  setRequestLocale(locale);
  await requireAdmin("/admin/speaker-profiles");
  const t = await getTranslations("admin");

  const supabase = await createClient();
  const { data, error } = supabase
    ? await supabase.from("speakers").select("*, event_speakers(event_id)").order("name_en")
    : { data: [], error: null };
  const speakers = (data ?? []) as Speaker[];

  return (
    <div className="grid gap-8">
      <header className="grid gap-2">
        <h1 className="text-h2 font-bold">{t("speakerProfilesTitle")}</h1>
        <p className="max-w-[65ch] text-fg-muted">{t("speakerProfilesBody")}</p>
        {error && (
          <p role="alert" className="text-destructive">
            {t("errorGeneric")}
          </p>
        )}
      </header>

      <section aria-labelledby="add-speaker" className="grid gap-4 rounded-lg border border-border bg-surface p-4">
        <h2 id="add-speaker" className="text-h3 font-bold">
          {t("addSpeaker")}
        </h2>
        <ActionForm action={saveSpeaker} resetOnSuccess className="grid gap-4">
          <SpeakerFields />
          <button type="submit" className="btn btn-primary h-10 w-fit px-4 text-sm">
            {t("add")}
          </button>
        </ActionForm>
      </section>

      <ul className="grid gap-3" data-testid="admin-speaker-profiles">
        {speakers.map((s) => (
          <li key={s.id} className="rounded-lg border border-border p-4">
            <details>
              <summary className="cursor-pointer font-bold">
                {loc(s, "name", locale)}{" "}
                <span className="text-sm font-normal text-fg-muted">· {t("eventCount", { n: s.event_speakers.length })}</span>
              </summary>
              <div className="mt-4 grid gap-4">
                <ActionForm action={saveSpeaker} className="grid gap-4">
                  <SpeakerFields speaker={s} />
                  <button type="submit" className="btn btn-primary h-10 w-fit px-4 text-sm">
                    {t("save")}
                  </button>
                </ActionForm>
                <ActionForm action={deleteSpeaker} confirmText={t("deleteSpeakerConfirm", { name: loc(s, "name", locale) ?? s.slug })}>
                  <input type="hidden" name="id" value={s.id} />
                  <button type="submit" className={`${smallBtn} text-destructive`}>
                    {t("remove")}
                  </button>
                </ActionForm>
              </div>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}
