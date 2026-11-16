import { getTranslations } from "next-intl/server";
import { LockKeyhole } from "lucide-react";
import type { Locale } from "@/i18n/routing";
import { formatShortDate, loc } from "@/lib/event-format";
import { cn } from "@/lib/utils";
import { ActionForm } from "@/components/admin/action-form";
import { SpeakerLinkForm } from "@/components/admin/speaker-link-form";
import { dangerBtn, panelClass, smallBtn } from "@/components/admin/styles";
import { createSpeakerLink, deleteSpeakerContact, revokeSpeakerLinks } from "@/app/[locale]/admin/speakers/actions";

/** One row of admin_speaker_contact_status(): which fields a speaker shared, never the values. */
export type SpeakerContactStatus = {
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
 * Contact details for the speakers of one event. Consent belongs to the speaker, not the
 * event, so a speaker who comes back for another session shows the same status there.
 * Admin-only: it renders inside requireAdmin pages and shows no contact values.
 */
export async function SpeakerContactsPanel({ rows, locale }: { rows: SpeakerContactStatus[]; locale: Locale }) {
  const t = await getTranslations("admin");
  return (
    <section aria-labelledby="speaker-contacts" className={cn(panelClass, "grid gap-4 p-4 sm:p-6")}>
      <div className="grid gap-1.5">
        <h2 id="speaker-contacts" className="flex items-center gap-2 text-lg font-bold text-fg">
          <LockKeyhole aria-hidden className="size-4 text-brand-purple-soft" />
          {t("speakersTitle")}
        </h2>
        <p className="max-w-[65ch] text-sm text-fg-muted">{t("speakersBody")}</p>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-4 py-3 text-sm text-fg-subtle">{t("contactsEmpty")}</p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-md border border-border">
          {rows.map((s) => {
            const name = loc(s, "name", locale) ?? s.slug;
            const shared = [
              s.has_email && t("fieldEmail"),
              s.has_phone && t("fieldPhone"),
              s.has_linkedin && t("fieldLinkedin"),
            ].filter(Boolean) as string[];
            return (
              <li key={s.speaker_id} data-testid="speaker-row" className="grid gap-4 bg-bg-deep/30 p-4">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  <p className="font-bold text-fg">{name}</p>
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
                {(s.consented_at || s.link_expires_at) && (
                  <div className="grid gap-1 text-sm text-fg-subtle">
                    {s.consented_at && <p>{t("consentedAt", { date: formatShortDate(s.consented_at, locale) })}</p>}
                    {s.link_expires_at && <p>{t("openLink", { date: formatShortDate(s.link_expires_at, locale) })}</p>}
                  </div>
                )}
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
                    <ActionForm action={deleteSpeakerContact} confirmText={t("deleteContactConfirm", { name })} className="ms-auto">
                      <input type="hidden" name="speaker_id" value={s.speaker_id} />
                      <button type="submit" className={dangerBtn}>
                        {t("deleteContact")}
                      </button>
                    </ActionForm>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
