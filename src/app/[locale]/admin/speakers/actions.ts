"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getLocale, getTranslations } from "next-intl/server";
import { adminClient } from "@/lib/auth/viewer";
import { SITE_URL } from "@/config/site";
import { localizedPath } from "@/lib/seo";
import type { Locale } from "@/i18n/routing";
import type { ActionState } from "@/components/admin/action-form";

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};

/**
 * Creates a single-use link. The raw token is returned to the admin once and never
 * stored (the database keeps only its SHA-256). It's built on the origin the admin is
 * using, so a preview deployment hands out links for its own (dev) database.
 */
export async function createSpeakerLink(_: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await adminClient();
  const t = await getTranslations("admin");
  const days = Math.min(60, Math.max(1, Number.parseInt(str(fd, "days"), 10) || 14));
  const { data, error } = await supabase.rpc("admin_create_speaker_token", {
    p_speaker_id: str(fd, "speaker_id"),
    p_valid_days: days,
  });
  const row = (Array.isArray(data) ? data[0] : null) as { token: string } | null;
  if (error || !row?.token) return { ok: false, message: t("errorGeneric") };

  const origin = (await headers()).get("origin") ?? SITE_URL;
  const locale = (await getLocale()) as Locale;
  revalidatePath("/[locale]/admin/events", "layout");
  return { ok: true, message: t("linkReady"), link: `${origin}${localizedPath(locale, `/speaker/${row.token}`)}` };
}

export async function revokeSpeakerLinks(_: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await adminClient();
  const t = await getTranslations("admin");
  const { error } = await supabase.rpc("admin_revoke_speaker_tokens", { p_speaker_id: str(fd, "speaker_id") });
  if (error) return { ok: false, message: t("errorGeneric") };
  revalidatePath("/[locale]/admin/events", "layout");
  return { ok: true, message: t("saved") };
}

/** Hard delete (the speaker asked, or the club decided). */
export async function deleteSpeakerContact(_: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await adminClient();
  const t = await getTranslations("admin");
  const { error } = await supabase.rpc("admin_delete_speaker_contact", { p_speaker_id: str(fd, "speaker_id") });
  if (error) return { ok: false, message: t("errorGeneric") };
  revalidatePath("/[locale]/admin/events", "layout");
  return { ok: true, message: t("deleted") };
}
