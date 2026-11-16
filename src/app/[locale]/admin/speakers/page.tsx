import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { requireAdmin } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { formatShortDate, loc } from "@/lib/event-format";
import { ActionForm } from "@/components/admin/action-form";
import { smallBtn } from "@/components/admin/styles";
import { SpeakerLinkForm } from "@/components/admin/speaker-link-form";
import { createSpeakerLink, deleteSpeakerContact, revokeSpeakerLinks } from "./actions";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/speakers">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin" });
  return { title: t("speakersTitle"), robots: { index: false, follow: false } };
}

type StatusRow = {
  speaker_id: string;
  slug: string;
  name_he: string;
  name_en: string;
  has_contact: boolean;
  has_email: boolean;
  has_phone: boolean;
  has_linkedin: boolean;
  linkedin_public: boolean;
  consented_at: string | null;
  link_expires_at: string | null;
};

/**
 * Admin view of speaker contact data. It shows WHICH fields a speaker shared, never
 * the values (members read those through member_speaker_contact()).
 */
export default async function AdminSpeakersPage({ params }: PageProps<"/[locale]/admin/speakers">) {
  const { locale: l } = await params;
  const locale = l as Locale;
  setRequestLocale(locale);
  await requireAdmin("/admin/speakers");
  const t = await getTranslations("admin");

  const supabase = await createClient();
  const { data, error } = supabase ? await supabase.rpc("admin_speaker_contact_status") : { data: [], error: null };
  const rows = (data ?? []) as StatusRow[];

  return (
    <div className="grid gap-8">
      <header className="grid gap-2">
        <h1 className="text-h2 font-bold">{t("speakersTitle")}</h1>
        <p className="max-w-[65ch] text-fg-muted">{t("speakersBody")}</p>
        {error && (
          <p role="alert" className="text-destructive">
            {t("errorGeneric")}
          </p>
        )}
      </header>

      <ul className="grid gap-3">
        {rows.map((s) => {
          const name = loc(s, "name", locale) ?? s.slug;
          const shared = [
            s.has_email && t("fieldEmail"),
            s.has_phone && t("fieldPhone"),
            s.has_linkedin && t("fieldLinkedin"),
          ].filter(Boolean) as string[];
          return (
            <li key={s.speaker_id} data-testid="speaker-row" className="grid gap-4 rounded-lg border border-border p-4 sm:p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
                <p className="text-lg font-semibold text-fg">{name}</p>
                <div className="flex flex-wrap gap-2">
                  {!s.has_contact ? (
                    <span className="tag tag-tbd">{t("noContact")}</span>
                  ) : shared.length ? (
                    shared.map((f) => (
                      <span key={f} className="tag">
                        {f}
                      </span>
                    ))
                  ) : (
                    <span className="tag">{t("nothingShared")}</span>
                  )}
                  {s.linkedin_public && <span className="tag tag-tentative">{t("linkedinPublic")}</span>}
                </div>
              </div>
              <div className="grid gap-1 text-sm text-fg-subtle">
                {s.consented_at && <p>{t("consentedAt", { date: formatShortDate(s.consented_at, locale) })}</p>}
                {s.link_expires_at && <p>{t("openLink", { date: formatShortDate(s.link_expires_at, locale) })}</p>}
              </div>
              <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
                <SpeakerLinkForm
                  action={createSpeakerLink}
                  speakerId={s.speaker_id}
                  labels={{
                    create: t("createLink"),
                    days: t("validDays"),
                    copy: t("copy"),
                    copied: t("copied"),
                    link: name,
                  }}
                />
                {s.link_expires_at && (
                  <ActionForm action={revokeSpeakerLinks}>
                    <input type="hidden" name="speaker_id" value={s.speaker_id} />
                    <button type="submit" className={smallBtn}>
                      {t("revokeLink")}
                    </button>
                  </ActionForm>
                )}
                {s.has_contact && (
                  <ActionForm
                    action={deleteSpeakerContact}
                    confirmText={t("deleteContactConfirm", { name })}
                    className="ms-auto"
                  >
                    <input type="hidden" name="speaker_id" value={s.speaker_id} />
                    <button type="submit" className="btn h-10 border-border px-3 text-sm text-destructive hover:bg-surface-hover">
                      {t("deleteContact")}
                    </button>
                  </ActionForm>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
