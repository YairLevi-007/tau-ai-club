"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { adminClient } from "@/lib/auth/viewer";
import { contentErrorKey, revalidatePublicContent, str } from "@/lib/admin/content";
import type { ActionState } from "@/components/admin/action-form";

// Public speaker profile only. Contact details never go through this form: speakers
// submit those themselves through the single-use link (/admin/speakers).
const fields = (fd: FormData) => ({
  slug: str(fd, "slug").toLowerCase(),
  name_he: str(fd, "name_he"),
  name_en: str(fd, "name_en"),
  company_he: str(fd, "company_he") || null,
  company_en: str(fd, "company_en") || null,
  role_he: str(fd, "role_he") || null,
  role_en: str(fd, "role_en") || null,
  bio_he: str(fd, "bio_he") || null,
  bio_en: str(fd, "bio_en") || null,
  photo_url: str(fd, "photo_url") || null,
});

/** next/image only serves photos from Supabase Storage (next.config.ts remotePatterns). */
function isAllowedPhotoHost(url: string) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname.endsWith(".supabase.co");
  } catch {
    return false;
  }
}

const revalidateSpeakers = () => {
  revalidatePath("/[locale]/admin/speaker-profiles", "page");
  revalidatePath("/[locale]/admin/speakers", "page");
  revalidatePublicContent();
};

export async function saveSpeaker(_: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await adminClient();
  const t = await getTranslations("admin");
  const row = fields(fd);
  if (!row.slug || !row.name_he || !row.name_en) return { ok: false, message: t("errorRequired") };
  if (row.photo_url && !isAllowedPhotoHost(row.photo_url)) return { ok: false, message: t("errorPhotoHost") };
  const id = str(fd, "id");
  const { error } = id
    ? await supabase.from("speakers").update(row).eq("id", id)
    : await supabase.from("speakers").insert(row);
  if (error) return { ok: false, message: t(contentErrorKey(error.code)) };
  revalidateSpeakers();
  return { ok: true, message: id ? t("saved") : t("added") };
}

/** Fails while the speaker is on any event's line-up (event_speakers on delete restrict). */
export async function deleteSpeaker(_: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await adminClient();
  const t = await getTranslations("admin");
  const { error, count } = await supabase.from("speakers").delete({ count: "exact" }).eq("id", str(fd, "id"));
  if (error?.code === "23503") return { ok: false, message: t("errorSpeakerOnEvent") };
  if (error || !count) return { ok: false, message: t(contentErrorKey(error?.code)) };
  revalidateSpeakers();
  return { ok: true, message: t("deleted") };
}
