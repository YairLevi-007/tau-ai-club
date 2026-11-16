import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { createPublicClient } from "@/lib/supabase/public";
import { formatShortDate, loc } from "@/lib/event-format";
import { AuthPanel } from "@/components/auth/auth-buttons";
import { SpeakerContactForm } from "@/components/speaker/speaker-contact-form";
import { submitSpeakerContact } from "./actions";

// One page per secret token: never cache, never index, never leak the URL via Referer.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/[locale]/speaker/[token]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "speakerForm" });
  return {
    title: t("eyebrow"),
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}

type Info = { name_he: string; name_en: string; expires_at: string };

export default async function SpeakerFormPage({ params }: PageProps<"/[locale]/speaker/[token]">) {
  const { locale: l, token } = await params;
  const locale = l as Locale;
  setRequestLocale(locale);
  const t = await getTranslations("speakerForm");

  const supabase = createPublicClient();
  const valid = /^[0-9a-f]{64}$/.test(token);
  const { data } = supabase && valid ? await supabase.rpc("speaker_form_info", { p_token: token }) : { data: null };
  const info = (Array.isArray(data) ? data[0] : null) as Info | null;

  if (!info) {
    return (
      <AuthPanel testId="speaker-form-invalid" title={t("invalidTitle")}>
        <p>{t("invalidBody")}</p>
      </AuthPanel>
    );
  }

  return (
    <AuthPanel
      testId="speaker-form"
      eyebrow={<p className={locale === "he" ? "eyebrow-he" : "eyebrow-pixel text-[0.6875rem]"}>{t("eyebrow")}</p>}
      title={t("title", { name: loc(info, "name", locale) ?? "" })}
    >
      <p>{t("intro")}</p>
      <p className="text-sm text-fg-subtle">{t("expires", { date: formatShortDate(info.expires_at, locale) })}</p>
      <SpeakerContactForm
        action={submitSpeakerContact}
        token={token}
        labels={{
          shareEmail: t("shareEmail"),
          sharePhone: t("sharePhone"),
          shareLinkedin: t("shareLinkedin"),
          linkedinPublic: t("linkedinPublic"),
          email: t("email"),
          phone: t("phone"),
          linkedin: t("linkedin"),
          linkedinHint: t("linkedinHint"),
          membersOnlyNote: t("membersOnlyNote"),
          consent: t("consent"),
          submit: t("submit"),
          doneTitle: t("doneTitle"),
          doneBody: t("doneBody"),
        }}
      />
    </AuthPanel>
  );
}
