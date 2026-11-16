"use server";

import { getTranslations } from "next-intl/server";
import { createPublicClient } from "@/lib/supabase/public";
import type { ActionState } from "@/components/admin/action-form";

const str = (fd: FormData, k: string, max = 300) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim().slice(0, max) : "";
};
const on = (fd: FormData, k: string) => fd.get(k) === "on";

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PHONE = /^\+?[0-9][0-9 ()-]{5,22}$/;
const LINKEDIN = /^https:\/\/([a-z]{2,3}\.)?linkedin\.com\/[A-Za-z0-9_/%.-]+$/;

/**
 * Speaker form submission. Runs as anon: the single-use token is the credential, and
 * submit_speaker_contact() checks it, requires consent and stores only consented fields.
 * Nothing the speaker typed is echoed back or logged.
 */
export async function submitSpeakerContact(_: ActionState, fd: FormData): Promise<ActionState> {
  const t = await getTranslations("speakerForm");
  const shareEmail = on(fd, "share_email");
  const sharePhone = on(fd, "share_phone");
  const shareLinkedin = on(fd, "share_linkedin");
  const email = shareEmail ? str(fd, "email", 254).toLowerCase() : "";
  const phone = sharePhone ? str(fd, "phone", 30) : "";
  const linkedin = shareLinkedin ? str(fd, "linkedin", 200) : "";

  if (!on(fd, "consent")) return { ok: false, message: t("errorConsent") };
  if (shareEmail && !EMAIL.test(email)) return { ok: false, message: t("errorEmail") };
  if (sharePhone && !PHONE.test(phone)) return { ok: false, message: t("errorPhone") };
  if (shareLinkedin && !LINKEDIN.test(linkedin)) return { ok: false, message: t("errorLinkedin") };

  const supabase = createPublicClient();
  if (!supabase) return { ok: false, message: t("errorGeneric") };
  const { error } = await supabase.rpc("submit_speaker_contact", {
    p_token: str(fd, "token", 64),
    p_consent: true,
    p_share_email: shareEmail,
    p_email: email || null,
    p_share_phone: sharePhone,
    p_phone: phone || null,
    p_share_linkedin: shareLinkedin,
    p_linkedin_url: linkedin || null,
    p_linkedin_public: shareLinkedin && on(fd, "linkedin_public"),
  });
  if (error) {
    if (error.code === "28000") return { ok: false, message: t("errorExpired") };
    return { ok: false, message: t("errorGeneric") };
  }
  return { ok: true, message: t("doneTitle") };
}
